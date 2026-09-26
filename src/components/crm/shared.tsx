import {useState,type ReactNode} from "react";
import {useQuery} from "@tanstack/react-query";
import {useServerFn} from "@tanstack/react-start";
import {AppShell} from "@/components/layout/app-shell";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {LoadingState,ErrorState,EmptyState,PermissionDenied} from "@/components/states";
import {useOrganization} from "@/lib/org/org-context";
import {queryCrm,type CrmRow} from "@/lib/crm/crm.functions";
import {areas,type Field} from "./config";
export const str=(v:unknown)=>v===null||v===undefined?"—":typeof v==="object"?JSON.stringify(v):String(v);
export const money=(v:unknown)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
export function Shell({title,permission="crm.read",children}:{title:string;permission?:string;children:(org:string)=>ReactNode}){
 const {currentOrganization,hasPermission,isLoading}=useOrganization();
 return <AppShell title={title}><nav className="mb-5 flex flex-wrap gap-2">{[["","Dashboard","crm.dashboard"],...Object.entries(areas).map(([k,a])=>[k,a.title,a.permission]),["relatorios","Relatórios","crm.read"],["configuracoes","Configurações","crm.configure"]].filter(([, ,p])=>hasPermission(p)).map(([k,t])=><Button asChild variant="outline" key={k}><a href={`/comercial${k?"/"+k:""}`}>{t}</a></Button>)}</nav>{isLoading?<LoadingState/>:!currentOrganization?<EmptyState title="Selecione uma organização"/>:!hasPermission(permission)?<PermissionDenied permission={permission}/>:<div key={currentOrganization.organization_id}>{children(currentOrganization.organization_id)}</div>}</AppShell>;
}
export function ResultState({loading,error,empty,children}:{loading:boolean;error:Error|null;empty:boolean;children:ReactNode}){return loading?<LoadingState/>:error?<ErrorState description={error.message}/>:empty?<EmptyState title="Nenhum resultado" description="Cadastre informações reais ou ajuste os filtros."/>:<>{children}</>}
export function Picker({org,kind,value,onChange,required=false}:{org:string;kind:string;value:string;onChange:(v:string)=>void;required?:boolean}){
 const api=useServerFn(queryCrm);const [q,setQ]=useState("");const[page,setPage]=useState(1);
 const result=useQuery({queryKey:["crm",org,"picker",kind,q,page],queryFn:()=>api({data:{organizationId:org,kind,filters:q?{q}:{},page}})});
 return <div className="space-y-1"><Input placeholder="Buscar opções" value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} aria-label="Buscar opções"/>
 <select className="w-full rounded border bg-background p-2" value={value} required={required} onChange={e=>onChange(e.target.value)}><option value="">Selecione</option>{value&&!result.data?.rows?.some(r=>r.id===value)&&<option value={value}>Registro selecionado</option>}{result.data?.rows?.map(r=><option key={r.id} value={r.id}>{str(r.name||r.legal_name||r.title||r.sku||r.full_name||r.email||r.representative_code||r.id)}</option>)}</select>{result.error&&<p role="alert" className="text-destructive">{result.error.message}</p>}{result.isLoading&&<p>Carregando opções…</p>}{(result.data?.total||0)>50&&<Pager page={page} total={result.data?.total||0} setPage={setPage}/>}</div>;
}
export function Fields({org,fields,values,setValues}:{org:string;fields:Field[];values:Record<string,string>;setValues:(v:Record<string,string>)=>void}){
 return <div className="grid gap-4 sm:grid-cols-2">{fields.map(f=><label className="space-y-1 text-sm" key={f.key}><span>{f.label}</span>{f.lookup?<Picker org={org} kind={f.lookup} value={values[f.key]||""} required={f.required} onChange={v=>setValues({...values,[f.key]:v})}/>:f.options?<select className="w-full rounded border bg-background p-2" value={values[f.key]||""} required={f.required} onChange={e=>setValues({...values,[f.key]:e.target.value})}><option value="">Selecione</option>{f.options.map(o=><option key={o}>{o}</option>)}</select>:<Input type={f.type||"text"} min={f.type==="number"?0:undefined} step={f.type==="number"?"0.01":undefined} value={values[f.key]||""} required={f.required} onChange={e=>setValues({...values,[f.key]:e.target.value})}/>}</label>)}</div>
}
export function Pager({page,total,setPage}:{page:number;total:number;setPage:(p:number)=>void}){return total>50?<div className="flex gap-3"><Button variant="outline" disabled={page===1} onClick={()=>setPage(page-1)}>Anterior</Button><span>{page} / {Math.ceil(total/50)}</span><Button variant="outline" disabled={page*50>=total} onClick={()=>setPage(page+1)}>Próxima</Button></div>:null}
export function rowValues(row:CrmRow){return Object.fromEntries(Object.entries(row).filter(([,v])=>v!==null&&typeof v!=="object").map(([k,v])=>[k,String(v)]))}
