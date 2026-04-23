import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScanLine, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Called with the scanned code (also fires onChange) */
  onScan?: (code: string) => void;
  /** Auto close after a successful scan (default true) */
  autoCloseOnScan?: boolean;
}

/**
 * Barcode input with manual number entry + camera scan button.
 * Uses @zxing/browser. Works offline once the JS bundle is cached by the PWA.
 */
export function BarcodeInput({
  value,
  onChange,
  placeholder = 'Barcode',
  className,
  onScan,
  autoCloseOnScan = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    (async () => {
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);
        const preferred =
          list.find((d) => /back|rear|environment/i.test(d.label))?.deviceId ||
          list[0]?.deviceId ||
          '';
        const id = deviceId || preferred;
        setDeviceId(id);

        if (!videoRef.current) return;
        controlsRef.current = await reader.decodeFromVideoDevice(
          id || undefined,
          videoRef.current,
          (result, err, controls) => {
            if (result) {
              const code = result.getText();
              onChange(code);
              onScan?.(code);
              toast.success(`Scanned: ${code}`);
              if (autoCloseOnScan) {
                controls.stop();
                setOpen(false);
              }
            }
          },
        );
      } catch (e: any) {
        toast.error(e?.message || 'Camera access denied');
        setOpen(false);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId]);

  return (
    <>
      <div className={`flex gap-2 ${className || ''}`}>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          inputMode="numeric"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setOpen(true)}
          title="Scan with camera"
          aria-label="Scan barcode with camera"
        >
          <ScanLine className="w-4 h-4" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan Barcode</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {devices.length > 1 && (
              <select
                className="w-full h-9 px-3 rounded-md border bg-background text-sm"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              >
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                  </option>
                ))}
              </select>
            )}
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-3/4 h-1/3 border-2 border-primary/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              ဘားကုဒ်ကို frame ထဲမှာထားပေးပါ
            </p>
            <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
              <X className="w-4 h-4 mr-1" /> Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
