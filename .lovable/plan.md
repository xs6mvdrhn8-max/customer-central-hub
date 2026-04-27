## အခြေအနေ

လက်ရှိ app မှာ မပါသေးတဲ့ feature တွေကို ဖြည့်စွက်ပေးပါမယ် —
- **Print system** (Invoice, Items, Sales, Purchase, Profit & Loss)
- **CSV Import/Export** (Items, Customers, Vendors)
- **GitHub repo က seed products 10 ခု + ပုံများ** ကို လက်ရှိ catalog ထဲပေါင်းထည့်

## Plan

### 1) Reusable Print engine
ဖိုင်အသစ် `src/lib/print.ts` ဖန်တီး — `printHtml(html, title)` function တစ်ခုနဲ့ hidden iframe သုံးပြီး browser native print dialog ဖွင့်ပေးမယ်။ Logo + store name + date footer ပါ template wrapper တစ်ခု ထည့်မယ်။

### 2) Print buttons (5 နေရာ)
| နေရာ | ဘာ print လုပ်မလဲ |
|---|---|
| `InvoicesView.tsx` | Invoice တစ်ခုချင်း — ဈေးဆိုင်နာမည်/လိပ်စာ/ထည့်ထားတဲ့ logo + customer + lines table + total/paid/balance |
| `ItemsAdmin.tsx` | Items list — code/name/category/SKU/barcode/stock/price/cost (filter လုပ်ထားတာ print) |
| `InvoicesView.tsx` Sales report | ရက်စွဲ range filter ပြီး sales summary table + grand total |
| `PurchasesAdmin.tsx` | Purchase order တစ်ခုချင်း — vendor/date/lines/total |
| `ProfitLossAdmin.tsx` | Period selection + Revenue/COGS/Gross Profit table |

အကုန်လုံးမှာ Myanmar font (Noto Sans Myanmar) ကို print stylesheet ထဲထည့်ပေးမယ်။

### 3) CSV Import / Export
ဖိုင်အသစ် `src/lib/csv.ts` — `toCsv(rows, headers)` နဲ့ `parseCsv(text)` (RFC 4180 quoting support)။

Templates:
- **Items**: `name, category, price, originalPrice, cost, stock, reorderLevel, barcode, sku, location, description, badge`
- **Customers**: `name, phone, email, address, note`
- **Vendors**: `name, phone, email, address, note`

`ItemsAdmin`, `CustomersAdmin`, `VendorsAdmin` တွေမှာ ခလုတ် ၃ ခု ထည့်မယ်:
- **Download Template** (header row only)
- **Import CSV** (validate → preview count → confirm → upsert; existing matches by `id` or `barcode/name`)
- **Export CSV** (current list အကုန်)

Import errors တွေ row-level error report သေးသေးနဲ့ ပြပေးမယ် (`Row 5: price must be a number`).

### 4) GitHub seed products ပေါင်းထည့်
Reference `src/data/products.ts` ထဲက ပစ္စည်း ၁၀ ခု (Claw Hammer, Cordless Impact Drill, Screwdriver Set, Safety Goggles, Angle Grinder, Measuring Tape, Adjustable Wrench, Circular Saw, Work Gloves + ၁ခု) ကို လက်ရှိ `seedProducts` array ထဲ ပေါင်းမယ် — `originalPrice`, `badge`, description အပြည့်ပါ။ Image ကတော့ Unsplash URL ပါတဲ့ Claw Hammer ကိုသာထား၊ ကျန်တာ placeholder.svg သုံးပါမယ် (private `/lovable-uploads/...` image တွေက ကူးယူလို့မရပါ)။

သီးသန့်ထပ်ထည့်တဲ့အရာတွေ:
- `Product.id` တွေဟာ unique ဖြစ်အောင် `seed-` prefix သုံးမယ်
- Categories ထဲ မရှိသေးတဲ့ "Power Tools", "Hand Tools", "Accessories" တို့ default list ထဲမှာ ရှိပြီးသား — အသုံးချနိုင်တယ်
- Existing user data ထိခိုက်စေဖို့ — seed merge က **first-time install** အခါမှာသာ ထည့်ပေးမယ် (localStorage empty ဖြစ်နေတဲ့အခါ)

### 5) Types update
`Customer`, `Vendor` type တွေမှာ optional `email?: string`, `address?: string` ထပ်ထည့်ပါမယ် (CSV columns နဲ့ ကိုက်ဖို့)။ `importSchema.ts` က ထိုင်ပြီး passthrough ဖြစ်တဲ့အတွက် backup ထဲ ပါသွားရင် မပျက်ပါ။

## Technical notes
- `print.ts` က iframe sandbox `allow-modals allow-same-origin` သုံး — pop-up blocker ကို ရှောင်နိုင်
- CSV parser က BOM + Excel quirks handle လုပ်ပေးမယ်
- Print stylesheet ထဲ `@page { size: A4; margin: 12mm }` + `body { font-family: 'Noto Sans Myanmar', system-ui }`
- Files changed: `print.ts` (new), `csv.ts` (new), `InvoicesView.tsx`, `ItemsAdmin.tsx`, `PurchasesAdmin.tsx`, `ProfitLossAdmin.tsx`, `CustomersAdmin.tsx`, `VendorsAdmin.tsx`, `StoreContext.tsx` (seed merge), `types/index.ts`, `importSchema.ts`

အတည်ပြုပေးရင် ဆက်လုပ်ပါ့မယ်။
