import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, ScanLine, Search, Trash2, Pencil, X, Check, AlertTriangle,
  Link2, Camera, Minus, Package, ChevronDown, ChevronUp, Loader2,
  PlugZap, Unplug, CircleDot
} from "lucide-react";

const POS_LIST = [
  { id: "square", name: "Square" },
  { id: "shopify", name: "Shopify POS" },
  { id: "clover", name: "Clover" },
  { id: "toast", name: "Toast" },
  { id: "lightspeed", name: "Lightspeed" },
];

const STORAGE_KEY = "stockline-data";

function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

async function lookupBarcode(code) {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data && Array.isArray(data.items) && data.items.length > 0) {
      const it = data.items[0];
      return {
        name: it.title || "",
        brand: it.brand || "",
        category: it.category || "",
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/* ---------------- Camera barcode scanner ---------------- */
function CameraScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [supported, setSupported] = useState(true);
  const streamRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!("BarcodeDetector" in window)) {
      setSupported(false);
      return;
    }
    let cancelled = false;
    const detector = new window.BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
    });

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const scanLoop = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length > 0) {
              onDetected(codes[0].rawValue);
              return;
            }
          } catch (e) {
            // keep trying
          }
          rafRef.current = requestAnimationFrame(scanLoop);
        };
        rafRef.current = requestAnimationFrame(scanLoop);
      } catch (e) {
        setError("Camera access was blocked or unavailable.");
      }
    }
    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-between items-center mb-3">
          <span className="text-amber-400 text-xs tracking-widest uppercase font-semibold">
            Scan barcode
          </span>
          <button onClick={onClose} className="text-slate-300 hover:text-white">
            <X size={22} />
          </button>
        </div>
        {!supported && (
          <div className="bg-slate-800 text-slate-200 text-sm p-4 rounded-lg">
            Camera scanning isn't supported in this browser. Enter the code manually below,
            or use a USB/Bluetooth barcode scanner — it types the code like a keyboard.
          </div>
        )}
        {supported && error && (
          <div className="bg-slate-800 text-slate-200 text-sm p-4 rounded-lg">{error}</div>
        )}
        {supported && !error && (
          <div className="relative rounded-lg overflow-hidden border-2 border-amber-400">
            <video ref={videoRef} className="w-full aspect-square object-cover" muted playsInline />
            <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-amber-400 shadow-[0_0_8px_2px_rgba(251,191,36,0.8)] animate-pulse" />
          </div>
        )}
        <p className="text-slate-400 text-xs mt-3 text-center">
          Hold the barcode steady inside the frame.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Add / Edit item modal ---------------- */
function ItemModal({ initial, connectedPosIds, onSave, onClose }) {
  const isEdit = !!initial;
  const [barcode, setBarcode] = useState(initial?.barcode || "");
  const [name, setName] = useState(initial?.name || "");
  const [brand, setBrand] = useState(initial?.brand || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [lowStock, setLowStock] = useState(initial?.lowStock ?? 5);
  const [linkedPos, setLinkedPos] = useState(initial?.posLinks || ["test"]);
  const [lookupState, setLookupState] = useState("idle"); // idle | loading | found | notfound
  const [showCamera, setShowCamera] = useState(false);
  const barcodeInputRef = useRef(null);

  useEffect(() => {
    if (!isEdit) barcodeInputRef.current?.focus();
  }, [isEdit]);

  const runLookup = useCallback(async (code) => {
    if (!code) return;
    setLookupState("loading");
    const result = await lookupBarcode(code);
    if (result && result.name) {
      setName(result.name);
      setBrand(result.brand);
      setCategory(result.category);
      setLookupState("found");
    } else {
      setLookupState("notfound");
    }
  }, []);

  const handleBarcodeSubmit = (e) => {
    e.preventDefault();
    if (barcode.trim()) runLookup(barcode.trim());
  };

  const togglePos = (id) => {
    setLinkedPos((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleSave = () => {
    if (!barcode.trim() || !name.trim()) return;
    onSave({
      id: initial?.id || uid("item"),
      barcode: barcode.trim(),
      name: name.trim(),
      brand: brand.trim(),
      category: category.trim() || "Uncategorized",
      qty: Number(qty) || 0,
      lowStock: Number(lowStock) || 0,
      posLinks: linkedPos,
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {showCamera && (
        <CameraScanner
          onDetected={(code) => {
            setShowCamera(false);
            setBarcode(code);
            runLookup(code);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 text-white px-5 py-4 flex items-center justify-between">
          <h2 className="font-semibold tracking-wide uppercase text-sm text-amber-400">
            {isEdit ? "Edit item" : "Add item"}
          </h2>
          <button onClick={onClose} className="text-slate-300 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {!isEdit && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Barcode
              </label>
              <form onSubmit={handleBarcodeSubmit} className="flex gap-2 mt-1">
                <input
                  ref={barcodeInputRef}
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scan or type the code, then press Enter"
                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="bg-slate-900 text-white px-3 rounded-lg hover:bg-slate-800"
                  title="Scan with camera"
                >
                  <Camera size={18} />
                </button>
              </form>
              <div className="mt-2 text-xs h-4">
                {lookupState === "loading" && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <Loader2 size={12} className="animate-spin" /> Looking up item…
                  </span>
                )}
                {lookupState === "found" && (
                  <span className="text-emerald-600">Found it — details filled in below.</span>
                )}
                {lookupState === "notfound" && (
                  <span className="text-slate-500">
                    Couldn't find this one automatically — enter the details below.
                  </span>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Item name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sea salt kettle chips, 8oz"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Brand
              </label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Category
              </label>
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Quantity
              </label>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={() => setQty((q) => Math.max(0, Number(q) - 1))}
                  className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-slate-50"
                >
                  <Minus size={16} />
                </button>
                <input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="w-full text-center border border-slate-300 rounded-lg px-2 py-2 text-sm"
                />
                <button
                  onClick={() => setQty((q) => Number(q) + 1)}
                  className="w-9 h-9 rounded-lg border border-slate-300 flex items-center justify-center hover:bg-slate-50"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Low stock at
              </label>
              <input
                type="number"
                value={lowStock}
                onChange={(e) => setLowStock(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 mt-1 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Sync to POS
            </label>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => togglePos("test")}
                className={`text-xs px-3 py-1.5 rounded-full border flex items-center gap-1 ${
                  linkedPos.includes("test")
                    ? "bg-amber-400 border-amber-400 text-slate-900 font-medium"
                    : "border-slate-300 text-slate-500"
                }`}
              >
                <CircleDot size={12} /> Test POS
              </button>
              {POS_LIST.filter((p) => connectedPosIds.includes(p.id)).map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePos(p.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    linkedPos.includes(p.id)
                      ? "bg-amber-400 border-amber-400 text-slate-900 font-medium"
                      : "border-slate-300 text-slate-500"
                  }`}
                >
                  {p.name}
                </button>
              ))}
              {connectedPosIds.length === 0 && (
                <span className="text-xs text-slate-400">
                  Connect a POS system in the POS tab to sync there too.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-300 rounded-lg py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!barcode.trim() || !name.trim()}
            className="flex-1 bg-slate-900 disabled:bg-slate-300 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-slate-800"
          >
            {isEdit ? "Save changes" : "Add to inventory"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Item row ---------------- */
function ItemRow({ item, onQtyChange, onEdit, onDelete }) {
  const isLow = item.qty <= item.lowStock;
  return (
    <div className="flex items-center gap-3 py-3 px-4 border-b border-slate-100 hover:bg-slate-50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-slate-900 truncate">{item.name}</p>
          {isLow && (
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded font-semibold">
              <AlertTriangle size={10} /> Low
            </span>
          )}
        </div>
        <p className="text-xs text-slate-400 font-mono mt-0.5">{item.barcode}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
            {item.category}
          </span>
          {item.posLinks?.length > 0 && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Link2 size={11} /> {item.posLinks.length} POS
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onQtyChange(item.id, Math.max(0, item.qty - 1))}
          className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center hover:bg-slate-100"
        >
          <Minus size={14} />
        </button>
        <span className="w-8 text-center text-sm font-semibold">{item.qty}</span>
        <button
          onClick={() => onQtyChange(item.id, item.qty + 1)}
          className="w-7 h-7 rounded border border-slate-300 flex items-center justify-center hover:bg-slate-100"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-1">
        <button onClick={() => onEdit(item)} className="p-1.5 text-slate-400 hover:text-slate-700">
          <Pencil size={15} />
        </button>
        <button onClick={() => onDelete(item.id)} className="p-1.5 text-slate-400 hover:text-rose-600">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- POS card ---------------- */
function PosCard({ posId, name, connected, catalog, expanded, onToggleExpand, onToggleConnect, isTest }) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between p-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900">{name}</p>
            {isTest && (
              <span className="text-[10px] uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-semibold">
                Built-in
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {connected ? `${catalog.length} item${catalog.length === 1 ? "" : "s"} synced` : "Not connected"}
          </p>
        </div>
        {isTest ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
            <PlugZap size={14} /> Connected
          </span>
        ) : (
          <button
            onClick={() => onToggleConnect(posId)}
            className={`flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full ${
              connected ? "bg-slate-100 text-slate-600" : "bg-slate-900 text-white"
            }`}
          >
            {connected ? (
              <>
                <Unplug size={13} /> Disconnect
              </>
            ) : (
              <>
                <PlugZap size={13} /> Connect
              </>
            )}
          </button>
        )}
      </div>
      {catalog.length > 0 && (
        <div>
          <button
            onClick={() => onToggleExpand(posId)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-500 border-t border-slate-100 hover:bg-slate-50"
          >
            View synced items
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {expanded && (
            <div className="border-t border-slate-100 max-h-48 overflow-y-auto">
              {catalog.map((c) => (
                <div key={c.itemId} className="flex justify-between px-4 py-2 text-xs border-b border-slate-50 last:border-0">
                  <span className="text-slate-700">{c.name}</span>
                  <span className="text-slate-400 font-mono">qty {c.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- Main app ---------------- */
export default function App() {
  const [tab, setTab] = useState("inventory");
  const [loaded, setLoaded] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [posConnections, setPosConnections] = useState({});
  const [posCatalogs, setPosCatalogs] = useState({ test: [] });
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [expandedPos, setExpandedPos] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) {
          const d = JSON.parse(res.value);
          setInventory(d.inventory || []);
          setPosConnections(d.posConnections || {});
          setPosCatalogs(d.posCatalogs || { test: [] });
        }
      } catch (e) {
        // no saved data yet
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set(
          STORAGE_KEY,
          JSON.stringify({ inventory, posConnections, posCatalogs })
        );
      } catch (e) {
        console.error("Save failed", e);
      }
    })();
  }, [inventory, posConnections, posCatalogs, loaded]);

  const syncItemToPos = useCallback((item) => {
    setPosCatalogs((prev) => {
      const next = { ...prev };
      const allPos = ["test", ...POS_LIST.map((p) => p.id)];
      allPos.forEach((posId) => {
        const list = next[posId] ? [...next[posId]] : [];
        const idx = list.findIndex((c) => c.itemId === item.id);
        if (item.posLinks?.includes(posId)) {
          const entry = {
            itemId: item.id,
            name: item.name,
            barcode: item.barcode,
            qty: item.qty,
            syncedAt: new Date().toISOString(),
          };
          if (idx >= 0) list[idx] = entry;
          else list.push(entry);
        } else if (idx >= 0) {
          list.splice(idx, 1);
        }
        next[posId] = list;
      });
      return next;
    });
  }, []);

  const handleSaveItem = (itemData) => {
    setInventory((prev) => {
      const idx = prev.findIndex((i) => i.id === itemData.id);
      let next;
      if (idx >= 0) {
        next = [...prev];
        next[idx] = itemData;
      } else {
        next = [...prev, itemData];
      }
      return next;
    });
    syncItemToPos(itemData);
    setShowAddModal(false);
    setEditingItem(null);
  };

  const handleQtyChange = (id, qty) => {
    setInventory((prev) => {
      const next = prev.map((i) => (i.id === id ? { ...i, qty } : i));
      const updated = next.find((i) => i.id === id);
      if (updated) syncItemToPos(updated);
      return next;
    });
  };

  const handleDelete = (id) => {
    setInventory((prev) => prev.filter((i) => i.id !== id));
    setPosCatalogs((prev) => {
      const next = {};
      Object.keys(prev).forEach((posId) => {
        next[posId] = prev[posId].filter((c) => c.itemId !== id);
      });
      return next;
    });
  };

  const toggleConnect = (posId) => {
    setPosConnections((prev) => ({ ...prev, [posId]: !prev[posId] }));
  };

  const connectedPosIds = POS_LIST.filter((p) => posConnections[p.id]).map((p) => p.id);

  const filtered = inventory.filter((i) => {
    const q = search.toLowerCase();
    return (
      i.name.toLowerCase().includes(q) ||
      i.barcode.includes(q) ||
      i.category.toLowerCase().includes(q)
    );
  });

  const lowCount = inventory.filter((i) => i.qty <= i.lowStock).length;

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Oswald', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      {/* Header */}
      <header className="bg-slate-900 text-white">
        <div className="max-w-2xl mx-auto px-4 pt-5 pb-0">
          <div className="flex items-center gap-2 mb-4">
            <ScanLine className="text-amber-400" size={22} />
            <h1 className="font-display uppercase tracking-widest text-lg font-semibold">
              Stockline
            </h1>
          </div>
          <div className="flex gap-6">
            {[
              { id: "inventory", label: "Inventory" },
              { id: "pos", label: "POS Connections" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-amber-400 text-white"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 pb-28 pt-4">
        {tab === "inventory" && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, barcode, or category"
                  className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
              <span>{inventory.length} items</span>
              {lowCount > 0 && (
                <span className="flex items-center gap-1 text-rose-600 font-medium">
                  <AlertTriangle size={12} /> {lowCount} low stock
                </span>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {filtered.length === 0 ? (
                <div className="p-10 text-center text-slate-400">
                  <Package size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {inventory.length === 0
                      ? "No items yet. Tap the + button to scan your first item."
                      : "Nothing matches that search."}
                  </p>
                </div>
              ) : (
                filtered.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onQtyChange={handleQtyChange}
                    onEdit={setEditingItem}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </div>
          </>
        )}

        {tab === "pos" && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 leading-relaxed bg-white border border-slate-200 rounded-lg p-3">
              The Test POS below is fully working — items you sync to it actually appear in its
              catalog. The other systems simulate the connection flow here; wiring up real Square,
              Shopify, Clover, Toast, or Lightspeed accounts needs a backend to hold their API
              keys securely, which this preview doesn't have.
            </p>
            <PosCard
              posId="test"
              name="Test POS"
              connected={true}
              isTest
              catalog={posCatalogs.test || []}
              expanded={expandedPos === "test"}
              onToggleExpand={(id) => setExpandedPos(expandedPos === id ? null : id)}
              onToggleConnect={() => {}}
            />
            {POS_LIST.map((p) => (
              <PosCard
                key={p.id}
                posId={p.id}
                name={p.name}
                connected={!!posConnections[p.id]}
                catalog={posCatalogs[p.id] || []}
                expanded={expandedPos === p.id}
                onToggleExpand={(id) => setExpandedPos(expandedPos === id ? null : id)}
                onToggleConnect={toggleConnect}
              />
            ))}
          </div>
        )}
      </main>

      {tab === "inventory" && (
        <button
          onClick={() => setShowAddModal(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-amber-400 text-slate-900 shadow-lg flex items-center justify-center hover:bg-amber-300 active:scale-95 transition-transform"
        >
          <Plus size={26} />
        </button>
      )}

      {showAddModal && (
        <ItemModal
          connectedPosIds={connectedPosIds}
          onSave={handleSaveItem}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {editingItem && (
        <ItemModal
          initial={editingItem}
          connectedPosIds={connectedPosIds}
          onSave={handleSaveItem}
          onClose={() => setEditingItem(null)}
        />
      )}
    </div>
  );
}
