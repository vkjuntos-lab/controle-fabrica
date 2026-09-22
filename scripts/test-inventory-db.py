#!/usr/bin/env python3
"""Isolated PostgreSQL integration tests. Never connects to a deployed database."""
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
BIN = Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/18/bin'))
TMP = Path(tempfile.mkdtemp(prefix='inventory-test-'))
PORT = '55439'
BASE = [str(BIN / 'psql'), '-X', '-h', str(TMP), '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq']

def sql(query, user=None, fail=None):
    prefix = f"SET ROLE authenticated; SET request.jwt.claim.sub='{user}';" if user else ''
    p = subprocess.run(BASE, input=prefix+query, text=True, capture_output=True)
    if fail:
        assert p.returncode and fail.lower() in p.stderr.lower(), (fail, p.stdout, p.stderr)
        return
    assert not p.returncode, p.stderr
    return p.stdout.strip()

def uid(): return str(uuid.uuid4())
def call(name, args, user, fail=None): return sql(f"SELECT public.{name}({args});", user, fail)
def q(s): return "'"+str(s).replace("'", "''")+"'"

def setup():
    subprocess.run([str(BIN/'initdb'),'-D',str(TMP/'data'),'-A','trust','-U','postgres'],check=True,stdout=subprocess.DEVNULL)
    subprocess.run([str(BIN/'pg_ctl'),'-D',str(TMP/'data'),'-l',str(TMP/'log'),'-o',f'-p {PORT} -k {TMP} -c listen_addresses=','start'],check=True,stdout=subprocess.DEVNULL)
    sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage TO authenticated;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      GRANT USAGE ON SCHEMA auth TO authenticated,anon; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,anon;""")
    migrations = ['20260915210457_59fe8633-bfbe-4b09-85b4-d5113059994e.sql','20260917110000_catalog_mestre.sql','20260918100000_inventory_ledger.sql','20260921100000_inventory_integrity.sql']
    migrations += ['20260922100000_production.sql','20260923100000_inventory_workflows.sql','20260924100000_partners.sql']
    for name in migrations:
        # Historical migration contains an invalid record target in an obsolete RPC.
        # Preserve its bytes; defer function compilation only for that historical file.
        prefix = 'SET check_function_bodies=off;' if name.startswith('20260918100000') else ''
        sql(prefix+(ROOT/'supabase/migrations'/name).read_text())

def run():
    setup()
    a,b,reader,org,other,product,variant,factory,store,partner = [uid() for _ in range(10)]
    sql(f"INSERT INTO auth.users(id,email) VALUES ({q(a)},'a@test'),({q(b)},'b@test'),({q(reader)},'r@test'); INSERT INTO organizations(id,name,slug,created_by) VALUES ({q(org)},'A','a',{q(a)}),({q(other)},'B','b',{q(b)}); INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(reader)},'comercial'); INSERT INTO products(id,organization_id,code,name) VALUES({q(product)},{q(org)},'BALLET','Sapatilha Ballet'); INSERT INTO product_variants(id,organization_id,product_id,sku,size,color,barcode) VALUES({q(variant)},{q(org)},{q(product)},'BALLET-34-ROSA','34','Rosa','123456');")
    for loc,name,typ in [(factory,'Fábrica','FACTORY'),(store,'Loja','OWN_STORE'),(partner,'Parceiro A','PARTNER')]:
        sql(f"INSERT INTO inventory_locations(id,organization_id,code,name,type) VALUES({q(loc)},{q(org)},{q(name)},{q(name)},{q(typ)});")
    def post(typ,qty,loc=factory,key=None,user=a,fail=None,extra=''):
        return call('inventory_post_movement',','.join(map(q,[org,variant,loc,typ]))+f",{qty},_reason=>'Teste'"+(f",_idempotency_key=>{q(key)}" if key else '')+extra,user,fail)
    def balance(loc=None): return float(call('inventory_get_balance',q(org)+','+q(variant)+( ','+q(loc) if loc else ''),a))
    def transfer(qty,dest,typ='TRANSFER',items=None,key=None,fail=None):
        items = items or [{'variant_id':variant,'quantity':qty}]
        return call('inventory_post_transfer',','.join(map(q,[org,factory,dest,json.dumps(items),typ]))+(f",_idempotency_key=>{q(key)}" if key else ''),a,fail)
    post('OPENING_BALANCE',100); assert balance()==100
    post('SALE',20); assert balance()==80
    post('SALE_RETURN',2); assert balance()==82
    post('ADJUSTMENT_OUT',1); assert balance()==81
    post('ADJUSTMENT_IN',19); assert balance()==100
    transfer(10,store); transfer(20,partner,'PARTNER_SHIPMENT')
    assert [balance(l) for l in [factory,store,partner]]==[70,10,20] and balance()==100
    assert sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('sales','receivables','revenue')")=='0'
    print('PASS: arithmetic, adjustment and business acceptance 70/10/20 = 100; no financial module')
    post('SALE',71,fail='Saldo insuficiente'); post('SALE',71,extra=',_allow_negative_override=>true',fail='Override')
    post('ADJUSTMENT_IN',1,extra=",_direction=>'OUT'",fail='Direção')
    call('inventory_post_movement',','.join(map(q,[org,variant,factory,'ADJUSTMENT_OUT']))+',1',a,fail='Motivo')
    post('SALE',1,user=reader,fail='permissão'); post('SALE',1,user=b,fail='permissão')
    assert sql(f'SELECT count(*) FROM inventory_movements WHERE organization_id={q(org)}',b)=='0'
    call('inventory_get_balance',','.join(map(q,[org,variant]))+f',_user_id=>{q(a)}',b,fail='permissão')
    sql(f'UPDATE inventory_movements SET quantity=1 WHERE organization_id={q(org)}',a,fail='permission denied')
    sql(f'DELETE FROM inventory_movements WHERE organization_id={q(org)}',fail='não é editado')
    print('PASS: negative balance, override rejection, reason, RLS, permissions, immutable ledger')
    first=json.loads(post('PURCHASE_RECEIPT',5,key='event-1')); again=json.loads(post('PURCHASE_RECEIPT',5,key='event-1'))
    assert again['deduped'] and first['movement_id']==again['movement_id']
    post('PURCHASE_RECEIPT',6,key='event-1',fail='outro conteúdo')
    before=balance(); transfer(40,store,items=[{'variant_id':variant,'quantity':40}]*2,fail='Saldo insuficiente'); assert balance()==before
    orig=first['movement_id']; r=json.loads(call('inventory_reverse_movement',','.join(map(q,[org,orig,'Correção'])),a))
    assert balance()==100
    assert sql(f'SELECT status FROM inventory_movements WHERE id={q(orig)}')=='POSTED'
    assert json.loads(call('inventory_reverse_movement',','.join(map(q,[org,orig,'Repetido'])),a))['deduped']
    call('inventory_reverse_movement',','.join(map(q,[org,r['movement_id'],'Reverter estorno'])),a,fail='compensação')
    print('PASS: idempotency, duplicate SKU transfer rollback, immutable reversal and retry')
    # Real overlapping sessions: lock holder sleeps after first withdrawal; second waits.
    def concurrent_out(qty,delay):
        statement=f"SELECT inventory_post_movement({q(org)},{q(variant)},{q(factory)},'SALE',{qty});"
        return subprocess.run(BASE,input=f"SET ROLE authenticated; SET request.jwt.claim.sub={q(a)}; BEGIN; {statement} SELECT pg_sleep({delay}); COMMIT;",text=True,capture_output=True)
    with concurrent.futures.ThreadPoolExecutor() as pool:
        results=list(pool.map(lambda args:concurrent_out(*args),[(60,0.4),(50,0)]))
    assert sum(r.returncode==0 for r in results)==1 and balance(factory)>=0
    with concurrent.futures.ThreadPoolExecutor() as pool:
        ids=list(pool.map(lambda _:json.loads(post('PURCHASE_RECEIPT',1,key='race-key'))['movement_id'],range(2)))
    assert len(set(ids))==1
    print('PASS: actual concurrent withdrawals and idempotency in separate PostgreSQL sessions')
    count=json.loads(call('inventory_start_count',q(org)+','+q(factory),a))['id']
    post('SALE',1,fail='contagem')
    item=sql(f'SELECT id FROM inventory_count_items WHERE inventory_count_id={q(count)} AND variant_id={q(variant)}')
    call('inventory_save_count_item',','.join(map(q,[org,count,item]))+',8',a)
    call('inventory_complete_count',q(org)+','+q(count),a); assert balance(factory)==8
    call('inventory_save_count_item',','.join(map(q,[org,count,item]))+',9',a,fail='aberta')
    call('inventory_complete_count',q(org)+','+q(count),a,fail='andamento')
    print('PASS: count snapshot, location freeze, confirmation, no repeated completion/edit')
    positions=json.loads(call('inventory_query_positions',q(org)+',\'{"query":"123456"}\'',a))
    assert positions['total']==3
    call('inventory_query_positions',q(org),b,fail='permissão')
    assert sql(f"SELECT count(*) FROM audit_log WHERE organization_id={q(org)} AND context ? 'before' AND context ? 'after'")!='0'
    print('PASS: barcode positions, tenant isolation, before/after audit')
    # Reserved count references cannot bypass the location freeze through a generic call.
    c=json.loads(call('inventory_start_count',q(org)+','+q(factory),a))['id']
    post('SALE',1,extra=f",_reference_type=>'INVENTORY_COUNT',_reference_id=>{q(c)}",fail='reservada')
    call('inventory_post_movement_internal',','.join(map(q,[org,variant,factory,'SALE']))+',1',a,fail='permission denied')
    call('inventory_cancel_count',q(org)+','+q(c),a)
    # Reversal of a consumed receipt must not make stock negative by bypassing the setting.
    receipt=json.loads(post('PURCHASE_RECEIPT',10))['movement_id']
    post('SALE',15)
    call('inventory_reverse_movement',','.join(map(q,[org,receipt,'Já consumido'])),a,fail='Saldo insuficiente')
    sql(f"INSERT INTO organization_inventory_settings(organization_id,allow_negative_inventory) VALUES({q(org)},true)")
    result=json.loads(post('SALE',10)); assert result['warning']
    sql("DELETE FROM role_permissions WHERE role='admin' AND permission='inventory.allow_negative'")
    post('SALE',1,fail='permissão')
    sql("INSERT INTO role_permissions(role,permission) VALUES('admin','inventory.allow_negative')")
    post('PURCHASE_RECEIPT',100)
    sql(f"UPDATE organization_inventory_settings SET allow_negative_inventory=false WHERE organization_id={q(org)}")
    print('PASS: reserved references, private writer, negative reversal blocked, authorized negative warning')
    batch=uid()
    sql(f"INSERT INTO inventory_batches(id,organization_id,variant_id,batch_code) VALUES({q(batch)},{q(org)},{q(variant)},'LOTE-1')")
    post('PURCHASE_RECEIPT',20,extra=f',_batch_id=>{q(batch)}')
    post('SALE',21,extra=f',_batch_id=>{q(batch)}',fail='Saldo insuficiente')
    t=json.loads(transfer(5,store,items=[{'variant_id':variant,'quantity':5,'batch_id':batch}],key='batch-transfer'))
    assert float(call('inventory_get_balance',','.join(map(q,[org,variant,store,batch])),a))==5
    transfer(6,store,items=[{'variant_id':variant,'quantity':6,'batch_id':batch}],key='batch-transfer',fail='outro conteúdo')
    movements=sql(f"SELECT id FROM inventory_movements WHERE reference_id={q(t['transfer_id'])} AND direction='OUT'")
    before=balance()
    call('inventory_reverse_movement',','.join(map(q,[org,movements,'Devolver transferência'])),a)
    assert balance()==before and float(call('inventory_get_balance',','.join(map(q,[org,variant,store,batch])),a))==0
    c=json.loads(call('inventory_start_count',q(org)+','+q(factory),a))['id']
    read=json.loads(call('inventory_read_count',q(org)+','+q(c),a))
    assert len([i for i in read['items'] if i['variant_id']==variant])==2
    item=next(i for i in read['items'] if i['batch_id']==batch)
    call('inventory_save_count_item',','.join(map(q,[org,c,item['id']]))+',18',a)
    call('inventory_complete_count',q(org)+','+q(c),a)
    assert float(call('inventory_get_balance',','.join(map(q,[org,variant,factory,batch])),a))==18
    call('inventory_read_count',q(org)+','+q(c),b,fail='permissão')
    print('PASS: exact batch balance, batch transfer, atomic pair reversal and batch-aware count')
    # Pagination totals are computed in SQL, independent of PostgREST default row cap.
    sql(f"INSERT INTO product_variants(organization_id,product_id,sku) SELECT {q(org)},{q(product)},'ZERO-'||i FROM generate_series(1,1005)i")
    positions=json.loads(call('inventory_query_positions',q(org)+",'{}',1,50",a))
    assert positions['total']==3018 and len(positions['rows'])==50
    dashboard=json.loads(call('inventory_dashboard',q(org)+",'2000-01-01','2100-01-01'",a))
    assert dashboard['zero_skus']==1005
    assert len(json.loads(call('inventory_search_variants',q(org)+",'123456'",a)))==1
    print('PASS: more than 1000 SKUs, pagination, zero-stock dashboard, barcode search')


def cleanup():
    if (TMP/'data/postmaster.pid').exists():
        subprocess.run([str(BIN/'pg_ctl'),'-D',str(TMP/'data'),'-m','immediate','stop'],stdout=subprocess.DEVNULL)
    shutil.rmtree(TMP)

if __name__ == '__main__':
    try: run()
    finally: cleanup()
