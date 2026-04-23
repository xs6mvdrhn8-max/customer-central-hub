import { useState, useMemo } from 'react';
import { useStore } from '@/store/StoreContext';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Search } from 'lucide-react';
import { toast } from 'sonner';

export function ShopView() {
  const { products, addToCart } = useStore();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  const categories = useMemo(() => ['all', ...new Set(products.map((p) => p.category))], [products]);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchesQ = !q || p.name.toLowerCase().includes(q) || (p.location || '').toLowerCase().includes(q);
    const matchesC = category === 'all' || p.category === category;
    return matchesQ && matchesC;
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="ဥပမာ - drill, vendor, location"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {categories.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={category === c ? 'default' : 'outline'}
                onClick={() => setCategory(c)}
                className="capitalize whitespace-nowrap"
              >
                {c}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((p) => {
          const low = p.stock <= p.reorderLevel;
          return (
            <Card key={p.id} className="overflow-hidden flex flex-col">
              <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground">
                {p.imageUrl ? (
                  <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold opacity-30">{p.name.charAt(0)}</span>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <p className="text-xs text-muted-foreground">{p.category}</p>
                <h4 className="font-semibold mt-1">{p.name}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.description}</p>
                {p.location && <p className="text-xs mt-2">📍 {p.location}</p>}
                <div className="flex items-center justify-between mt-3">
                  <Badge variant={low ? 'destructive' : 'secondary'}>Stock: {p.stock}</Badge>
                  <strong className="text-primary">{p.price.toLocaleString()} Ks</strong>
                </div>
                <Button
                  size="sm"
                  className="mt-3 w-full"
                  disabled={p.stock <= 0}
                  onClick={() => {
                    addToCart(p);
                    toast.success(`${p.name} added to cart`);
                  }}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" /> Add
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
