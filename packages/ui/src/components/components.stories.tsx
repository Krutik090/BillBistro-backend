import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Search } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Card, CardTitle, CardDescription } from "./card";
import { Badge } from "./badge";
import { KpiTile } from "./kpi-tile";
import { Table, THead, TBody, TR, TH, TD } from "./table";
import { Drawer } from "./drawer";

const meta: Meta = { title: "BillBistro/Components" };
export default meta;

export const Buttons: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <Button>Charge ₹1,240</Button>
        <Button variant="secondary">Hold order</Button>
        <Button variant="ghost">Discount</Button>
        <Button variant="danger">Void bill</Button>
      </div>
      <div className="flex gap-3">
        <Button size="lg">Charge ₹1,240</Button>
        <Button size="lg" variant="secondary">Hold order</Button>
        <Button size="lg" variant="glow">Charge · UPI</Button>
      </div>
    </div>
  ),
};

export const Inputs: StoryObj = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-5">
      <Input label="Table / Token" placeholder="Search items, tables, bills…" leading={<Search size={16} />} />
      <Input size="lg" placeholder="POS large (56px)" />
    </div>
  ),
};

export const Badges: StoryObj = {
  render: () => (
    <div className="flex gap-3">
      <Badge>Dine-in</Badge><Badge tone="success">Paid</Badge><Badge tone="warning">Pending</Badge>
      <Badge tone="danger">Void</Badge><Badge tone="info">Online</Badge><Badge tone="brand">VIP</Badge>
    </div>
  ),
};

export const CardAndKpi: StoryObj = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-2 gap-4">
      <Card><CardTitle>Card title</CardTitle><CardDescription>Supporting copy lives here. Cards are the base surface for every panel.</CardDescription></Card>
      <KpiTile label="Today's sales" value={48920} format={(n) => `₹${n.toLocaleString("en-IN")}`} delta={12.4} />
    </div>
  ),
};

export const DataTable: StoryObj = {
  render: () => (
    <Table>
      <THead><TR><TH>Bill #</TH><TH>Table</TH><TH>Items</TH><TH numeric>Total</TH><TH>Status</TH></TR></THead>
      <TBody>
        <TR><TD>#1042</TD><TD>T4</TD><TD>2× Butter Chicken, Naan</TD><TD numeric>₹1,240</TD><TD><Badge tone="success">Paid</Badge></TD></TR>
        <TR><TD>#1043</TD><TD>T7</TD><TD>Paneer Tikka, 3× Lassi</TD><TD numeric>₹860</TD><TD><Badge tone="warning">Pending</Badge></TD></TR>
        <TR><TD>#1044</TD><TD>Online</TD><TD>Veg Biryani</TD><TD numeric>₹320</TD><TD><Badge tone="info">Online</Badge></TD></TR>
      </TBody>
    </Table>
  ),
};

export const SplitBillDrawer: StoryObj = {
  render: () => {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open drawer</Button>
        <Drawer open={open} onOpenChange={setOpen} title="Split bill" footer={<><Button variant="secondary" size="lg" onClick={() => setOpen(false)}>Hold order</Button><Button size="lg">Charge ₹1,240</Button></>}>
          <p className="text-sm text-muted">Drawer body — slide-in panel from the right (Framer Motion spring). Used for split bill, order details, filters.</p>
        </Drawer>
      </>
    );
  },
};
