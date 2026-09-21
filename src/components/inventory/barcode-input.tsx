import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

/** Leitores USB/Bluetooth que digitam o código e Enter; entrada manual no celular. */
export function BarcodeInput({
  onScan,
  disabled,
}: {
  onScan: (code: string) => void;
  disabled?: boolean;
}) {
  const [code, setCode] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) {
          onScan(code.trim());
          setCode("");
        }
      }}
    >
      <Label htmlFor="inventory-barcode">Ler barcode ou informar SKU</Label>
      <div className="flex gap-2">
        <Input
          id="inventory-barcode"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={disabled}
          placeholder="Leia o código e pressione Enter"
        />
        <Button type="submit" disabled={disabled || !code.trim()}>
          +1
        </Button>
      </div>
    </form>
  );
}
