
import React, { useState, useEffect, useRef } from 'react';
import { AppScreen, Recipe, SubstitutionHack, AppState, Ingredient, SafetyFactor } from './types';
import { GeminiService } from './services/geminiService';
import StoreList from './components/StoreList';
import Timer from './components/Timer';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const savedState = localStorage.getItem('rescue_chef_state');
    const lifetimeSaved = localStorage.getItem('totalSavings');
    
    const baseState = savedState ? JSON.parse(savedState) : {
      screen: AppScreen.LANDING,
      city: '',
      currentRecipe: null,
      selectedCookbookRecipe: null,
      scannedIngredients: [],
      wasteSaved: 0,
      cookbook: [],
      selectedMode: null
    };

    if (lifetimeSaved) {
      baseState.wasteSaved = parseInt(lifetimeSaved, 10);
    }
    
    return baseState;
  });

  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [isEditingIngredients, setIsEditingIngredients] = useState(false);
  const [newIngredientName, setNewIngredientName] = useState('');
  
  // Image Edit State
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [editImagePrompt, setEditImagePrompt] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // EXACT NORMALIZATION LOGIC FOR SAFETY SCORE
  const normalizeScore = (raw: any): number => {
    let num = parseFloat(String(raw).replace('%', ''));
    if (num > 0 && num < 1) num = num * 100;
    if (num > 100) num = num / 100;
    return Math.round(num);
  };

  useEffect(() => {
    try {
      // Strip base64 image data before saving to localStorage to prevent quota overflow
      const stateToSave = {
        ...state,
        cookbook: state.cookbook.map(r => ({ ...r, imageUrl: '' })),
        currentRecipe: state.currentRecipe ? { ...state.currentRecipe, imageUrl: '' } : null,
        selectedCookbookRecipe: state.selectedCookbookRecipe ? { ...state.selectedCookbookRecipe, imageUrl: '' } : null,
      };
      localStorage.setItem('rescue_chef_state', JSON.stringify(stateToSave));
      localStorage.setItem('totalSavings', state.wasteSaved.toString());
    } catch (e) {
      console.warn('localStorage save failed:', e);
    }
  }, [state]);

  useEffect(() => {
    document.body.classList.toggle('dark-mode', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  const getSafetyColor = (rawScore: any) => {
    const s = normalizeScore(rawScore);
    if (s >= 80) return 'bg-emerald-500';
    if (s >= 60) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const formatPercentage = (rawScore: any) => {
    return `${normalizeScore(rawScore)}% Safe`;
  };

  const handleScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    setLoading(true);
    setLoadingMsg("Vision AI: Analyzing pantry...");
    try {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const ingredients = await GeminiService.scanIngredients(base64);
        setState(prev => ({ 
          ...prev, 
          scannedIngredients: Array.from(new Set([...prev.scannedIngredients, ...ingredients])) 
        }));
        setLoading(false);
        showToast("📸 Pantry Scanned");
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const generateDecision = async () => {
    if (!inputQuery) return;
    setLoading(true);
    setLoadingMsg("Chef AI is crafting your rescue plan...");
    try {
      const recipe = await GeminiService.generateRecipeAndHacks(inputQuery, state.scannedIngredients);
      
      // Show result immediately WITHOUT image
      recipe.imageUrl = '';
      setState(prev => ({ ...prev, currentRecipe: recipe, screen: AppScreen.RESULT, selectedMode: null }));
      setLoading(false);

      // Generate illustration in background (non-blocking)
      GeminiService.generateRecipeImage(recipe.name).then(illustration => {
        if (illustration) {
          setState(prev => {
            if (prev.currentRecipe && prev.currentRecipe.id === recipe.id) {
              return { ...prev, currentRecipe: { ...prev.currentRecipe, imageUrl: illustration } };
            }
            return prev;
          });
        }
      }).catch(err => console.error("Background image gen failed:", err));

    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const handleMagicEdit = async () => {
    const activeRecipe = state.selectedCookbookRecipe || state.currentRecipe;
    if (!activeRecipe?.imageUrl || !editImagePrompt.trim()) return;
    
    setLoading(true);
    setLoadingMsg("Magic Edit: Modifying illustration...");
    try {
      const newImage = await GeminiService.editRecipeImage(activeRecipe.imageUrl, editImagePrompt);
      if (newImage) {
        const updatedRecipe = { ...activeRecipe, imageUrl: newImage };
        if (state.screen === AppScreen.RECIPE_DETAIL) {
          setState(prev => ({
            ...prev,
            selectedCookbookRecipe: updatedRecipe,
            cookbook: prev.cookbook.map(r => r.id === updatedRecipe.id ? updatedRecipe : r)
          }));
        } else {
          setState(prev => ({ ...prev, currentRecipe: updatedRecipe }));
        }
        showToast("✨ Image Updated!");
        setIsEditingImage(false);
        setEditImagePrompt('');
      } else {
        showToast("❌ Edit Failed");
      }
    } catch (err) {
      console.error(err);
      showToast("❌ Edit Failed");
    } finally {
      setLoading(false);
    }
  };

  const handleReadAloud = () => {
    let textToRead = "";
    const current = state.screen === AppScreen.RECIPE_DETAIL ? state.selectedCookbookRecipe : state.currentRecipe;
    
    switch (state.screen) {
      case AppScreen.LANDING:
        textToRead = "Welcome to Rescue Chef. Scan your ingredients or type what you want to eat.";
        break;
      case AppScreen.RESULT:
      case AppScreen.RECIPE_DETAIL:
        textToRead = current ? `${current.name}. ${current.description}.` : "No recipe found.";
        break;
      case AppScreen.COOKING:
        textToRead = current ? `Step ${currentStepIndex + 1}: ${current.steps[currentStepIndex]}` : "";
        break;
      case AppScreen.SHOPPING:
        textToRead = "Find missing ingredients at these nearby stores.";
        break;
      case AppScreen.COOKBOOK:
        textToRead = "Your saved recipes collection.";
        break;
    }
    if (textToRead) GeminiService.speak(textToRead);
  };

  const isRecipeSaved = (recipeId?: string) => {
    if (!recipeId) return false;
    return state.cookbook.some(r => r.id === recipeId);
  };

  const saveRecipe = (type: 'HACK_IT' | 'SHOP_IT') => {
    const current = state.currentRecipe;
    if (!current) return;
    
    if (isRecipeSaved(current.id)) {
      showToast("Already Saved");
      return;
    }

    const recipeToSave: Recipe = {
      ...current,
      type,
      savedDate: new Date().toLocaleDateString()
    };

    setState(prev => ({
      ...prev,
      cookbook: [recipeToSave, ...prev.cookbook]
    }));
    showToast("✅ Recipe saved to Cookbook!");
  };

  const addIngredient = () => {
    if (!newIngredientName.trim()) return;
    setState(prev => ({
      ...prev,
      scannedIngredients: [...prev.scannedIngredients, newIngredientName.trim()]
    }));
    setNewIngredientName('');
    showToast("➕ Added");
  };

  const removeIngredient = (idx: number) => {
    setState(prev => ({
      ...prev,
      scannedIngredients: prev.scannedIngredients.filter((_, i) => i !== idx)
    }));
  };

  const finishCooking = () => {
    if (!state.currentRecipe) return;
    
    // BUG FIX #1: Add savings to cumulative total
    const savings = state.selectedMode === 'HACK' ? (state.currentRecipe.savings_dh || 5) : 5;
    
    setState(prev => ({
      ...prev,
      wasteSaved: prev.wasteSaved + savings,
      screen: AppScreen.SUCCESS
    }));
  };

  const renderHeader = () => (
    <header className="p-4 bg-white border-b flex justify-between items-center sticky top-0 z-20 dark:bg-[#2D2D2D] dark:border-gray-800">
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => setState(prev => ({...prev, screen: AppScreen.LANDING}))}>
        <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white font-black italic shadow-lg">R</div>
        <span className="font-bold text-sm tracking-tight dark:text-white uppercase">Rescue Chef AI</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={handleReadAloud} className="bg-blue-600 text-white p-2 rounded-full w-8 h-8 flex items-center justify-center shadow active:scale-90"><i className="fa-solid fa-volume-high text-xs"></i></button>
        <div className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800">
          💰 {state.wasteSaved} DH Saved
        </div>
        <button onClick={toggleTheme} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 dark:bg-gray-800 dark:text-gray-300"><i className={`fa-solid ${theme === 'light' ? 'fa-moon' : 'fa-sun'}`}></i></button>
      </div>
    </header>
  );

  const renderLanding = () => (
    <div className="flex flex-col h-full space-y-6 px-6 pt-6">
      <div className="text-center space-y-2 py-4">
        <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase italic dark:text-white">RESCUE CHEF</h1>
        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">Zero Waste. Maximum Flavor.</p>
      </div>

      <div className="space-y-4">
        <button onClick={() => fileInputRef.current?.click()} className="w-full primary-btn py-5 rounded-2xl flex items-center justify-center gap-3 font-bold text-lg shadow-xl active:scale-95 transition-all"><i className="fa-solid fa-camera"></i> Scan Pantry</button>
        <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleScan} className="hidden" />

        <div className="bg-white border rounded-2xl p-4 shadow-sm dark:bg-[#2D2D2D] dark:border-gray-800">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pantry Items</h3>
            <button onClick={() => setIsEditingIngredients(!isEditingIngredients)} className={`text-[9px] font-bold px-2 py-1 rounded uppercase transition-all ${isEditingIngredients ? 'bg-orange-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
              {isEditingIngredients ? '✅ Done' : '✏️ Edit'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {state.scannedIngredients.map((item, i) => (
              <span key={i} className={`px-2 py-1 bg-gray-100 text-[9px] font-black rounded uppercase flex items-center gap-1 dark:bg-gray-800 dark:text-gray-300 transition-all ${isEditingIngredients ? 'border border-orange-200 bg-orange-50 dark:bg-orange-900/10' : ''}`}>
                {item}
                {isEditingIngredients && <button onClick={() => removeIngredient(i)} className="text-red-500 ml-1">×</button>}
              </span>
            ))}
            {state.scannedIngredients.length === 0 && <p className="text-[10px] text-gray-400 italic">No items yet — scan or add below.</p>}
          </div>
          {isEditingIngredients && (
            <div className="flex gap-2 animate-in slide-in-from-bottom-2 duration-300">
              <input type="text" placeholder="Add ingredient..." value={newIngredientName} onChange={(e) => setNewIngredientName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addIngredient()} className="flex-1 px-3 py-2 text-[10px] font-bold bg-gray-50 border rounded-xl outline-none dark:bg-gray-800 dark:border-gray-700" />
              <button onClick={addIngredient} className="bg-orange-500 text-white px-3 py-2 rounded-xl text-[10px] font-black">+</button>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <input type="text" placeholder="Your City (for nearby stores)" value={state.city} onChange={(e) => setState(prev => ({ ...prev, city: e.target.value }))} className="w-full px-4 py-4 rounded-xl border-2 dark:bg-gray-800 dark:border-gray-700 focus:border-orange-500 outline-none" />
          <textarea placeholder="What do you want to eat?" value={inputQuery} onChange={(e) => setInputQuery(e.target.value)} className="w-full px-4 py-4 rounded-xl border-2 dark:bg-gray-800 dark:border-gray-700 focus:border-orange-500 outline-none h-24 resize-none" />
          <button disabled={!inputQuery || loading} onClick={generateDecision} className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg shadow-lg disabled:opacity-50 active:scale-95 transition-all">Rescue This Meal</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-auto pb-8">
        <div className="bg-white p-4 rounded-xl border shadow-sm dark:bg-[#2D2D2D] dark:border-gray-800">
          <div className="text-[8px] text-gray-400 uppercase font-black">Total Savings</div>
          <div className="text-2xl font-black text-green-600">{state.wasteSaved} DH</div>
        </div>
        <button onClick={() => setState(prev => ({...prev, screen: AppScreen.COOKBOOK}))} className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-center justify-center active:bg-gray-50 dark:bg-[#2D2D2D] dark:border-gray-800">
          <i className="fa-solid fa-book text-orange-500 mb-1"></i>
          <span className="text-[10px] font-black uppercase">My Cookbook</span>
        </button>
      </div>
    </div>
  );

  const renderResult = () => {
    const recipe = state.currentRecipe;
    if (!recipe) return null;
    const recommendedId = (normalizeScore(recipe.safety_score) >= 75 && recipe.hacks.length <= 3) ? 1 : 2;

    const renderHeroImage = () => {
      if (recipe.imageUrl) {
        return <img src={recipe.imageUrl} className="w-full h-48 object-cover rounded-2xl mb-4 shadow-lg border border-gray-100 dark:border-gray-800" alt={recipe.name} />;
      }
      return (
        <div className="w-full h-48 bg-gradient-to-br from-orange-400 to-red-500 rounded-2xl mb-4 shadow-lg flex flex-col items-center justify-center p-6 text-white text-center">
          <span className="text-5xl mb-2">🍳</span>
          <h3 className="font-black uppercase italic text-sm">{recipe.name}</h3>
        </div>
      );
    };

    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-[#1e1e1e] overflow-y-auto pb-10">
        <div className="p-4 bg-white dark:bg-[#2D2D2D] border-b flex justify-between items-center sticky top-0 z-10">
          <button onClick={() => setState(prev => ({...prev, screen: AppScreen.LANDING}))} className="text-gray-400"><i className="fa-solid fa-arrow-left"></i></button>
          <div className="font-bold uppercase tracking-widest text-[10px] dark:text-gray-400">Your Options</div>
          <button onClick={handleReadAloud} className="text-blue-600"><i className="fa-solid fa-volume-high"></i></button>
        </div>

        <div className="p-6 space-y-6">
          <div className="text-center">
            {renderHeroImage()}
            <h2 className="text-3xl font-black text-gray-900 leading-tight dark:text-white uppercase italic">{recipe.name}</h2>
            <p className="text-gray-500 mt-2 text-sm">{recipe.description}</p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className={`p-6 rounded-3xl border-2 bg-white dark:bg-[#2D2D2D] transition-all relative ${recommendedId === 1 ? 'border-emerald-500 scale-[1.02] shadow-xl' : 'border-gray-100 dark:border-gray-800 opacity-80'}`}>
              <button onClick={() => saveRecipe('HACK_IT')} className={`absolute top-4 right-4 text-sm ${isRecipeSaved(recipe.id) ? 'text-orange-500' : 'text-gray-300'}`}><i className={`fa-solid ${isRecipeSaved(recipe.id) ? 'fa-bookmark' : 'fa-thumbtack'}`}></i></button>
              {recommendedId === 1 && <div className="absolute -top-3 left-6 bg-emerald-500 text-white text-[8px] font-black px-3 py-1 rounded-full uppercase">Chef Recommends</div>}
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-black dark:text-white uppercase italic">🔧 Hack It</h3>
                <span className={`text-[10px] font-black text-white px-2 py-1 rounded ${getSafetyColor(recipe.safety_score)}`}>{formatPercentage(recipe.safety_score)}</span>
              </div>
              <div className="space-y-2 mb-6">
                {recipe.hacks.map((h, i) => (
                  <div key={i} className="text-[11px] text-gray-700 dark:text-gray-300 flex gap-2">
                    <span className="text-emerald-500">✓</span>
                    <span>Use <b>{h.suggested_quantity} {h.suggested_hack}</b> instead of {h.missing_item}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => { setState(prev => ({ ...prev, currentRecipe: recipe, selectedMode: 'HACK', screen: AppScreen.COOKING })); setCurrentStepIndex(0); }} className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold uppercase active:scale-95 transition-all">Cook with Hacks</button>
            </div>

            <div className={`p-6 rounded-3xl border-2 bg-white dark:bg-[#2D2D2D] transition-all relative ${recommendedId === 2 ? 'border-blue-500 scale-[1.02] shadow-xl' : 'border-gray-100 dark:border-gray-800 opacity-80'}`}>
              <button onClick={() => saveRecipe('SHOP_IT')} className={`absolute top-4 right-4 text-sm ${isRecipeSaved(recipe.id) ? 'text-orange-500' : 'text-gray-300'}`}><i className={`fa-solid ${isRecipeSaved(recipe.id) ? 'fa-bookmark' : 'fa-thumbtack'}`}></i></button>
              <h3 className="text-xl font-black dark:text-white uppercase italic mb-4">🛒 Shop It</h3>
              <div className="space-y-4 mb-6">
                <div className="bg-blue-50 dark:bg-blue-900/10 p-3 rounded-xl">
                  <h4 className="text-[9px] font-black uppercase text-blue-700 dark:text-blue-400 mb-2">🛒 NEED TO BUY</h4>
                  <ul className="space-y-1">
                    {recipe.need_to_buy.map((ing, i) => (
                      <li key={i} className="text-[10px] font-bold text-blue-800 dark:text-blue-300 flex justify-between">
                        <span>{ing.name}</span>
                        <span>{ing.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button onClick={() => setState(prev => ({ ...prev, currentRecipe: recipe, selectedMode: 'SHOP', screen: AppScreen.SHOPPING }))} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold uppercase active:scale-95 transition-all">Go Shopping First</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCookbook = () => (
    <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e] overflow-y-auto">
      <div className="p-6 border-b flex justify-between items-center sticky top-0 bg-white dark:bg-[#2D2D2D] z-10">
        <button onClick={() => setState(prev => ({...prev, screen: AppScreen.LANDING}))} className="text-gray-400"><i className="fa-solid fa-arrow-left"></i></button>
        <h2 className="text-xl font-black tracking-tight uppercase italic text-orange-600">My Cookbook</h2>
        <div className="w-8"></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
        {state.cookbook.length > 0 ? state.cookbook.map(recipe => (
          <div key={recipe.id} onClick={() => setState(prev => ({...prev, selectedCookbookRecipe: recipe, screen: AppScreen.RECIPE_DETAIL}))} className="group cursor-pointer bg-white dark:bg-gray-800 rounded-3xl overflow-hidden shadow-sm border border-gray-100 dark:border-gray-700 hover:scale-[1.02] transition-all active:scale-95">
            <div className="h-40 relative bg-gray-100 dark:bg-gray-900">
              {recipe.imageUrl ? (
                <img src={recipe.imageUrl} className="w-full h-full object-cover" alt={recipe.name} />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-orange-400 to-red-400 flex items-center justify-center text-white text-3xl">🍝</div>
              )}
              <div className="absolute top-3 right-3 flex gap-1">
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase text-white ${recipe.type === 'HACK_IT' ? 'bg-emerald-500' : 'bg-blue-500'}`}>
                  {recipe.type === 'HACK_IT' ? 'Rescued' : 'Original'}
                </span>
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-black text-sm uppercase dark:text-white line-clamp-1">{recipe.name}</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">{recipe.prepTime} • {recipe.difficulty || 'Medium'}</p>
            </div>
          </div>
        )) : (
          <div className="text-center py-20 text-gray-400 col-span-full">
            <i className="fa-solid fa-utensils text-4xl mb-4 opacity-20"></i>
            <p className="text-xs uppercase font-black">No recipes saved yet.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderRecipeDetail = () => {
    const recipe = state.selectedCookbookRecipe || state.currentRecipe;
    if (!recipe) return null;

    const safeRecipe = {
      ...recipe,
      hacks: Array.isArray(recipe.hacks) ? recipe.hacks : [],
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps : [],
      tips: Array.isArray(recipe.tips) ? recipe.tips : [],
      safety_factors: Array.isArray(recipe.safety_factors) ? recipe.safety_factors : [],
      already_have: Array.isArray(recipe.already_have) ? recipe.already_have : [],
      need_to_buy: Array.isArray(recipe.need_to_buy) ? recipe.need_to_buy : [],
      safety_score: recipe.safety_score || 0,
      difficulty: recipe.difficulty || 'Medium',
      name: recipe.name || 'Untitled Recipe',
      description: recipe.description || '',
      imageUrl: recipe.imageUrl || null,
    };

    const isHackMode = safeRecipe.type === 'HACK_IT' || state.selectedMode === 'HACK';

    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e] overflow-y-auto pb-10">
        <div className="relative h-72">
          {safeRecipe.imageUrl ? (
            <img src={safeRecipe.imageUrl} className="w-full h-full object-cover" alt={safeRecipe.name} />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-orange-400 to-red-600 flex items-center justify-center text-white text-5xl italic font-black">CHEF</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30"></div>
          <button onClick={() => setState(prev => ({...prev, screen: state.selectedCookbookRecipe ? AppScreen.COOKBOOK : AppScreen.RESULT}))} className="absolute top-6 left-6 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center text-white"><i className="fa-solid fa-arrow-left"></i></button>
          
          <button 
            onClick={() => setIsEditingImage(true)} 
            className="absolute top-6 right-6 w-10 h-10 bg-orange-600 rounded-full flex items-center justify-center text-white shadow-lg active:scale-90"
          >
            <i className="fa-solid fa-wand-magic-sparkles"></i>
          </button>

          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex gap-2 mb-2">
              <span className="px-2 py-1 bg-orange-600 text-white text-[8px] font-black uppercase rounded">{safeRecipe.difficulty}</span>
              <span className={`px-2 py-1 text-white text-[8px] font-black uppercase rounded ${getSafetyColor(safeRecipe.safety_score)}`}>{formatPercentage(safeRecipe.safety_score)}</span>
            </div>
            <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter">{safeRecipe.name}</h1>
          </div>
        </div>

        {isEditingImage && (
          <div className="p-6 bg-orange-50 dark:bg-orange-900/10 border-b border-orange-100 dark:border-orange-800 animate-in slide-in-from-top-4 duration-300">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-[10px] font-black uppercase text-orange-600">AI Magic Edit</h4>
              <button onClick={() => setIsEditingImage(false)} className="text-gray-400">×</button>
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="e.g. 'Add a retro filter' or 'Make it more colorful'" 
                value={editImagePrompt}
                onChange={(e) => setEditImagePrompt(e.target.value)}
                className="flex-1 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800 rounded-xl px-4 py-3 text-xs outline-none focus:border-orange-500"
              />
              <button 
                onClick={handleMagicEdit}
                disabled={!editImagePrompt.trim() || loading}
                className="bg-orange-600 text-white px-6 py-3 rounded-xl font-black uppercase text-[10px] shadow-lg disabled:opacity-50"
              >
                Apply
              </button>
            </div>
            <p className="text-[9px] text-gray-400 mt-2">Powered by Gemini Nano Banana Image AI</p>
          </div>
        )}

        <div className="p-6 space-y-8">
          {isHackMode && safeRecipe.hacks.length > 0 && (
            <div className="bg-[#1E1E1E] border-l-4 border-emerald-500 p-4 rounded-xl shadow-lg">
              <h3 className="text-emerald-500 text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-2"><i className="fa-solid fa-wrench"></i> Hacks used in this recipe</h3>
              <div className="space-y-2">
                {safeRecipe.hacks.map((h, idx) => (
                  <div key={idx} className="text-[11px] font-bold text-gray-300">
                    <span className="text-emerald-400">{h.suggested_hack}</span> <span className="mx-2 text-gray-500">→</span> <span className="text-gray-400">instead of {h.missing_item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-orange-600 mb-4 flex items-center gap-2"><i className="fa-solid fa-check-circle"></i> Ingredients</h3>
            <div className="space-y-3">
              {safeRecipe.ingredients.map((ing, i) => (
                <div key={i} className="py-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex justify-between text-xs font-bold uppercase dark:text-gray-300">
                    <span>{ing.name}</span>
                    <span className="text-emerald-500">{ing.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-orange-600 mb-6">📝 Instructions</h3>
            <div className="space-y-6">
              {safeRecipe.steps.map((step, i) => (
                <div key={i} className="flex gap-4">
                  <div className="shrink-0 w-8 h-8 bg-orange-600 text-white rounded-full flex items-center justify-center font-black italic text-xs">{i + 1}</div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* BONUS ENHANCEMENT: Chef Tips */}
          {safeRecipe.tips.length > 0 && (
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-orange-600 mb-4">👨‍🍳 Chef Tips</h3>
              <div className="space-y-3">
                {safeRecipe.tips.map((tip, i) => (
                  <div key={i} className="p-4 bg-orange-50 dark:bg-orange-900/10 rounded-2xl flex gap-3 items-start border border-orange-100 dark:border-orange-800">
                    <span className="text-lg">💡</span>
                    <p className="text-xs font-semibold text-orange-800 dark:text-orange-200 leading-snug">{tip}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 flex gap-4">
          <button onClick={() => { setState(prev => ({ ...prev, currentRecipe: safeRecipe, screen: AppScreen.COOKING })); setCurrentStepIndex(0); }} className="flex-1 bg-orange-600 text-white py-4 rounded-2xl font-black uppercase italic active:scale-95 transition-all">Cook Now</button>
        </div>
      </div>
    );
  };

  const renderShopping = () => {
    const recipe = state.currentRecipe;
    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e] p-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => setState(prev => ({...prev, screen: AppScreen.RESULT}))} className="text-gray-400"><i className="fa-solid fa-chevron-left"></i></button>
          <h2 className="text-xl font-black uppercase italic text-blue-600">Nearby Stores</h2>
          <button onClick={handleReadAloud} className="text-blue-600"><i className="fa-solid fa-volume-high"></i></button>
        </div>

        {/* BUG FIX #3: Shopping Checklist */}
        {recipe && (
          <div className="mb-8 p-5 bg-blue-50 dark:bg-blue-900/10 rounded-3xl border border-blue-100 dark:border-blue-800 shadow-sm">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-700 dark:text-blue-400 mb-4 flex items-center gap-2">
              <i className="fa-solid fa-cart-shopping"></i> Your Shopping List
            </h3>
            <div className="space-y-3 mb-4">
              {recipe.need_to_buy.map((ing, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded border-2 border-blue-200 dark:border-blue-700 flex items-center justify-center text-[10px] text-blue-500">
                    <i className="fa-solid fa-check opacity-0"></i>
                  </div>
                  <div className="flex-1 flex justify-between text-xs font-bold text-gray-700 dark:text-gray-300">
                    <span>{ing.name}</span>
                    <span className="text-blue-600">{ing.quantity}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-blue-100 dark:border-blue-800 flex justify-between items-center">
              <span className="text-[10px] font-black uppercase text-gray-400">Estimated Cost</span>
              <span className="text-sm font-black text-blue-800 dark:text-blue-300">~{recipe.estimated_shopping_cost} DH</span>
            </div>
          </div>
        )}

        <StoreList city={state.city || 'Casablanca'} />
        
        <button onClick={() => { setState(prev => ({ ...prev, screen: AppScreen.COOKING })); setCurrentStepIndex(0); }} className="mt-8 w-full bg-black text-white py-5 rounded-2xl font-black text-lg shadow-xl uppercase active:scale-95 transition-all">Start Cooking</button>
      </div>
    );
  };

  const renderCooking = () => {
    const recipe = state.currentRecipe;
    if (!recipe) return null;
    return (
      <div className="flex flex-col h-full bg-white dark:bg-[#1e1e1e] p-6">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => setState(prev => ({...prev, screen: AppScreen.RESULT}))} className="text-gray-400"><i className="fa-solid fa-chevron-left"></i></button>
          <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${state.selectedMode === 'HACK' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
            {state.selectedMode === 'HACK' ? '🔧 HACKED' : '🛒 ORIGINAL'}
          </div>
        </div>
        <div className="flex-1 flex flex-col justify-center text-center space-y-8">
          <div>
            <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Step {currentStepIndex + 1} / {recipe.steps.length}</span>
            <h1 className="text-3xl font-black text-gray-900 leading-tight dark:text-white uppercase italic mt-2">{recipe.steps[currentStepIndex]}</h1>
          </div>
          <Timer />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-12 pb-6">
          <button disabled={currentStepIndex === 0} onClick={() => setCurrentStepIndex(currentStepIndex - 1)} className="p-5 bg-gray-100 text-gray-600 rounded-2xl font-bold uppercase text-xs dark:bg-gray-800 dark:text-gray-400">Prev</button>
          {currentStepIndex === recipe.steps.length - 1 ? (
            <button onClick={finishCooking} className="p-5 bg-black text-white rounded-2xl font-bold uppercase text-xs shadow-lg">Done! 🎉</button>
          ) : (
            <button onClick={() => setCurrentStepIndex(currentStepIndex + 1)} className="p-5 bg-orange-600 text-white rounded-2xl font-bold uppercase text-xs shadow-lg">Next</button>
          )}
        </div>
      </div>
    );
  };

  const renderSuccess = () => {
    const recipe = state.currentRecipe;
    if (!recipe) return null;
    
    // BUG FIX #2: Differentiate Hack vs Shop
    const isHack = state.selectedMode === 'HACK';
    const bgClass = isHack ? 'bg-gradient-to-br from-emerald-500 to-teal-700' : 'bg-gradient-to-br from-blue-600 to-indigo-800';
    const iconClass = isHack ? 'fa-trophy text-emerald-600' : 'fa-star text-blue-600';
    const title = isHack ? 'MEAL RESCUED!' : 'PERFECT RECIPE!';
    
    return (
      <div className={`flex flex-col h-full items-center justify-center p-8 text-white text-center animate-in fade-in zoom-in duration-500 ${bgClass}`}>
        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mb-6 shadow-2xl animate-bounce">
          <i className={`fa-solid ${iconClass} text-4xl`}></i>
        </div>
        
        <h1 className="text-5xl font-black uppercase italic mb-6 tracking-tighter">{title}</h1>
        
        <div className="space-y-4 mb-10 w-full max-w-[280px]">
          {isHack ? (
            <>
              <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Session Savings</div>
                <div className="text-3xl font-black">+{recipe.savings_dh} DH</div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold opacity-90 flex items-center justify-center gap-2">🌱 CO2 Prevented: ~{recipe.co2_saved_kg} kg</p>
                <p className="text-xs font-bold opacity-90 flex items-center justify-center gap-2">♻️ Food Saved: ~{recipe.waste_avoided_g}g from trash</p>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-70">Masterpiece Created</div>
                <div className="text-xl font-black">🛒 Cooked from Scratch!</div>
              </div>
              <p className="text-xs font-bold opacity-90">♻️ Food Waste Avoided: ~{recipe.waste_avoided_g}g</p>
            </>
          )}
        </div>

        <button 
          onClick={() => saveRecipe(isHack ? 'HACK_IT' : 'SHOP_IT')} 
          className="w-full bg-orange-500 text-white py-5 rounded-2xl font-black text-lg shadow-xl uppercase mb-4 active:scale-95"
        >
          Save Recipe
        </button>
        
        <button 
          onClick={() => setState(prev => ({...prev, screen: AppScreen.LANDING}))} 
          className="w-full bg-white text-gray-900 py-5 rounded-2xl font-black text-lg shadow-xl uppercase active:scale-95"
        >
          Go Home
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-md mx-auto bg-white dark:bg-[#1e1e1e] min-h-screen relative shadow-2xl overflow-hidden flex flex-col transition-all duration-300">
      {toast && <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[110] bg-black text-white px-4 py-2 rounded-full text-[10px] font-black uppercase shadow-2xl animate-in slide-in-from-top-4">{toast}</div>}
      {state.screen !== AppScreen.SUCCESS && state.screen !== AppScreen.RECIPE_DETAIL && renderHeader()}
      <div className="flex-1 overflow-y-auto">
        {state.screen === AppScreen.LANDING && renderLanding()}
        {state.screen === AppScreen.RESULT && renderResult()}
        {state.screen === AppScreen.SHOPPING && renderShopping()}
        {state.screen === AppScreen.COOKING && renderCooking()}
        {state.screen === AppScreen.COOKBOOK && renderCookbook()}
        {state.screen === AppScreen.RECIPE_DETAIL && renderRecipeDetail()}
        {state.screen === AppScreen.SUCCESS && renderSuccess()}
      </div>
      {loading && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-[100] flex flex-col items-center justify-center p-8 text-center text-white">
          <div className="w-20 h-20 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-6"></div>
          <p className="text-xl font-black mb-2 uppercase italic tracking-tight">{loadingMsg}</p>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest animate-pulse">Gemini AI Engine running...</p>
        </div>
      )}
    </div>
  );
};

export default App;
