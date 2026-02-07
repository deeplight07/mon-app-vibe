
import React, { useEffect, useState } from 'react';
import { GeminiService } from '../services/geminiService';
import { StoreLocation } from '../types';

interface StoreListProps {
  city: string;
}

const StoreList: React.FC<StoreListProps> = ({ city }) => {
  const [stores, setStores] = useState<StoreLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStores = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await GeminiService.findGroceryStores(city);
        setStores(results);
      } catch (err) {
        console.error("Failed to find stores", err);
        setError("⚠️ Could not load stores. Check your connection.");
      } finally {
        setLoading(false);
      }
    };
    fetchStores();
  }, [city]);

  if (loading) return (
    <div className="space-y-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-24 bg-blue-50/50 animate-pulse rounded-2xl border border-blue-100"></div>
      ))}
      <div className="text-xs text-blue-400 font-bold uppercase animate-bounce">Locating nearest suppliers...</div>
    </div>
  );

  if (error) return (
    <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold border border-red-100 italic">
      {error}
    </div>
  );

  return (
    <div className="space-y-3">
      {stores.length > 0 ? stores.map((store, idx) => (
        <a 
          key={idx} 
          href={store.uri} 
          target="_blank" 
          rel="noopener noreferrer"
          className="block p-4 bg-white border border-blue-100 rounded-2xl hover:bg-blue-50 transition-all active:scale-[0.98] shadow-sm shadow-blue-50/50"
        >
          <div className="flex items-start gap-2">
            <span className="text-blue-500 mt-1">📍</span>
            <div className="flex-1 overflow-hidden">
              <div className="font-black text-gray-900 truncate">
                {store.name}
              </div>
              <div className="text-xs text-gray-500 truncate leading-relaxed">
                {store.address || "Tap to view on Maps"}
              </div>
              {store.open_now !== undefined && (
                <div className="flex items-center gap-1 mt-1">
                  <span className={store.open_now ? "text-green-500" : "text-red-500"}>
                    {store.open_now ? "🟢" : "🔴"}
                  </span>
                  <span className={`text-xs font-black uppercase tracking-tight ${store.open_now ? "text-green-600" : "text-red-600"}`}>
                    {store.open_now ? "Open Now" : "Closed"}
                  </span>
                </div>
              )}
            </div>
            <i className="fa-solid fa-chevron-right text-blue-200 text-xs mt-2"></i>
          </div>
        </a>
      )) : (
        <p className="text-sm text-gray-500 italic p-4 bg-gray-50 rounded-xl">
          No stores found nearby in {city}. Try checking a different city.
        </p>
      )}
      <p className="text-xs text-gray-400 px-1">Stock availability not guaranteed.</p>
    </div>
  );
};

export default StoreList;
