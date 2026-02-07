
import { GoogleGenAI, Type, GenerateContentResponse, Modality } from "@google/genai";
import { SubstitutionHack, Recipe, StoreLocation } from "../types";

// Helper to decode base64
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to encode base64
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// PCM Decoding logic
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export class GeminiService {
  // Removed singleton instance to ensure the client is recreated before each API call as per guidelines.

  private static getClient() {
    // Guidelines: Always initialize GoogleGenAI with { apiKey: process.env.API_KEY }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  /**
   * Scan image for ingredients - Optimized with Gemini 3 Flash
   */
  static async scanIngredients(base64Image: string): Promise<string[]> {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: "List the food ingredients you see in this image. Return only a comma-separated list." }
        ]
      },
      config: {
        // Fix: Use thinkingBudget (tokens) instead of thinkingLevel (string) as per SDK rules.
        // Lower budget for fast low-latency vision scan.
        thinkingConfig: { thinkingBudget: 1024 }
      }
    });
    return response.text?.split(',').map(i => i.trim()) || [];
  }

  /**
   * Generate a unique illustration for a recipe
   */
  static async generateRecipeImage(recipeName: string): Promise<string | null> {
    const ai = this.getClient();
    const prompt = `A simple watercolor illustration of ${recipeName}, top-down view on a rustic wooden table, warm lighting, food photography style, sketch aesthetic`;
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: prompt }]
        },
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (error) {
      console.error("Failed to generate recipe image:", error);
    }
    return null;
  }

  /**
   * Edit an existing image using a text prompt
   */
  static async editRecipeImage(base64Image: string, prompt: string): Promise<string | null> {
    const ai = this.getClient();
    // Strip prefix if present
    const cleanBase64 = base64Image.includes('base64,') ? base64Image.split('base64,')[1] : base64Image;
    
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: cleanBase64, mimeType: 'image/png' } },
            { text: prompt }
          ]
        },
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (error) {
      console.error("Failed to edit image:", error);
    }
    return null;
  }

  /**
   * Main Decision Engine - Thinking Mode Optimized with Gemini 3 Flash
   */
  static async generateRecipeAndHacks(
    query: string, 
    userIngredients: string[]
  ): Promise<Recipe> {
    const ai = this.getClient();
    const systemInstruction = `
      You are a Michelin Star Chef and expert food safety engineer.
      Analyze the user's request and their available ingredients.
      Determine if missing ingredients can be safely hacked or if the user must shop.
      
      CRITICAL QUANTITY RULES:
      - EVERY ingredient and substitution MUST include a precise quantity with units.
      - Use metric conversions with a slash separator in parentheses.
      
      INGREDIENT SPLITTING:
      - 'already_have': Compare recipe ingredients with user's available ingredients: ${userIngredients.join(', ')}. List items user already has.
      - 'need_to_buy': List items user is missing for the original recipe.
      - 'estimated_shopping_cost': Estimated total cost in Moroccan Dirhams (DH) to buy the 'need_to_buy' items.

      COOKBOOK ENHANCEMENTS:
      - 'difficulty': Choose from 'Easy', 'Medium', 'Chef'.
      - 'savings_dh': Estimated savings in Moroccan Dirhams if hacked (between 10 and 100).
      - 'co2_saved_kg': Estimated CO2 prevented from waste (0.5 to 5.0 kg).
      - 'waste_avoided_g': Estimated grams of food saved from trash (100 to 1000g).
      - 'tips': 3 professional kitchen secrets to make the dish better.
      - 'servings': Standard serving size (integer).
      - 'totalTime': Total prep + cook time.

      Return a JSON object representing a Recipe.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Request: "${query}". Available Ingredients: ${userIngredients.join(', ')}`,
      config: {
        // Fix: Use thinkingBudget (tokens) instead of thinkingLevel (string) as per SDK rules.
        // Moderate budget for structured recipe reasoning.
        thinkingConfig: { thinkingBudget: 4096 },
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            prepTime: { type: Type.STRING },
            totalTime: { type: Type.STRING },
            servings: { type: Type.NUMBER },
            difficulty: { type: Type.STRING },
            savings_dh: { type: Type.NUMBER },
            co2_saved_kg: { type: Type.NUMBER },
            waste_avoided_g: { type: Type.NUMBER },
            estimated_shopping_cost: { type: Type.NUMBER },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } },
            safety_score: { type: Type.NUMBER },
            safety_factors: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  icon: { type: Type.STRING }
                },
                required: ['name', 'score', 'icon']
              }
            },
            ingredients: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  quantity: { type: Type.STRING }
                },
                required: ['name', 'quantity']
              }
            },
            already_have: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  quantity: { type: Type.STRING }
                },
                required: ['name', 'quantity']
              }
            },
            need_to_buy: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  quantity: { type: Type.STRING }
                },
                required: ['name', 'quantity']
              }
            },
            steps: { type: Type.ARRAY, items: { type: Type.STRING } },
            hacks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  missing_item: { type: Type.STRING },
                  suggested_hack: { type: Type.STRING },
                  suggested_quantity: { type: Type.STRING },
                  effectiveness_score: { type: Type.NUMBER },
                  safety_risk: { type: Type.STRING },
                  reason: { type: Type.STRING }
                },
                required: ['missing_item', 'suggested_hack', 'suggested_quantity', 'effectiveness_score', 'safety_risk', 'reason']
              }
            }
          },
          required: ['name', 'description', 'steps', 'prepTime', 'totalTime', 'servings', 'difficulty', 'hacks', 'ingredients', 'already_have', 'need_to_buy', 'safety_score', 'tips', 'savings_dh', 'co2_saved_kg', 'waste_avoided_g', 'estimated_shopping_cost']
        }
      }
    });

    const data = JSON.parse(response.text || '{}');
    
    const isHackRecommended = data.hacks.every((h: SubstitutionHack) => 
      h.effectiveness_score >= 70 && h.safety_risk !== 'High'
    );

    return {
      id: Math.random().toString(36).substr(2, 9),
      ...data,
      isHackRecommended
    };
  }

  /**
   * Find nearby grocery stores - Maps Grounding
   */
  static async findGroceryStores(city: string): Promise<StoreLocation[]> {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Find 3 grocery stores or supermarkets in ${city}. For each store, provide exactly:
- STORE: [Name]
- ADDRESS: [Full street address]
- STATUS: [Open or Closed]
Use Google Maps to verify details.`,
      config: {
        tools: [{ googleMaps: {} }]
      }
    });

    const text = response.text || "";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const stores: StoreLocation[] = [];

    const storeBlocks = text.split(/- STORE:/i).slice(1);
    
    storeBlocks.forEach((block, idx) => {
      const lines = block.split('\n');
      const name = lines[0].trim();
      const addressMatch = block.match(/ADDRESS:\s*(.*)/i);
      const statusMatch = block.match(/STATUS:\s*(.*)/i);
      
      const address = addressMatch ? addressMatch[1].trim() : "Tap to view on Maps";
      const isOpen = statusMatch ? statusMatch[1].toLowerCase().includes('open') : undefined;

      const chunk = chunks.find((c: any) => 
        c.maps && c.maps.title && 
        (c.maps.title.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(c.maps.title.toLowerCase()))
      ) || (chunks[idx]?.maps ? chunks[idx] : null);

      stores.push({
        name: name,
        address: address,
        uri: chunk?.maps?.uri || "https://maps.google.com/?q=" + encodeURIComponent(name + " " + city),
        open_now: isOpen
      });
    });

    if (stores.length === 0) {
      return chunks
        .filter((c: any) => c.maps)
        .map((c: any) => ({
          name: c.maps.title || "Nearby Store",
          address: "Tap to view on Maps",
          uri: c.maps.uri
        }))
        .slice(0, 3);
    }

    return stores.slice(0, 3);
  }

  /**
   * TTS - Generate Speech
   */
  static async speak(text: string): Promise<void> {
    const ai = this.getClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read clearly: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return new Promise(async (resolve) => {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          audioCtx.close();
          resolve();
        };
        source.start();
      });
    }
  }
}
