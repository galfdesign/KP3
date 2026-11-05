import { GoogleGenAI, Type } from "@google/genai";
import { AnalysisData } from "../types";

// Declare pdfjsLib which is loaded via CDN in index.html
declare const pdfjsLib: any;

export const isAiAvailable = Boolean(process.env.API_KEY);

// Local file processing must also work when AI is not configured.
let ai: GoogleGenAI | undefined;
const getAiClient = (): GoogleGenAI => {
    if (!isAiAvailable) {
        throw new Error('ИИ-анализ пока недоступен. Используйте ручной замер.');
    }
    return ai ??= new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Renders ALL pages of a PDF file to a single continuous high-res vertical image.
 */
const convertPdfToImage = async (file: File): Promise<string> => {
    return new Promise(async (resolve, reject) => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            const scale = 1.5; // Good balance between quality and memory for multi-page
            const pagesData = [];
            let totalHeight = 0;
            let maxWidth = 0;

            // 1. Pre-calculate dimensions and load pages
            // Limit to 20 pages to prevent browser memory crash
            const pagesToRender = Math.min(pdf.numPages, 20);
            
            for (let i = 1; i <= pagesToRender; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale });
                pagesData.push({ page, viewport });
                totalHeight += viewport.height;
                if (viewport.width > maxWidth) maxWidth = viewport.width;
            }

            // 2. Create master canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            if (!context) {
                reject(new Error("Could not create canvas context"));
                return;
            }
            
            canvas.width = maxWidth;
            canvas.height = totalHeight;

            // Fill white background
            context.fillStyle = "#FFFFFF";
            context.fillRect(0, 0, canvas.width, canvas.height);

            // 3. Render pages sequentially
            let currentY = 0;
            for (const { page, viewport } of pagesData) {
                // Determine horizontal offset to center pages if they have different widths
                const xOffset = (maxWidth - viewport.width) / 2;
                
                // We need to render to the canvas context at the specific offset.
                // pdf.js render allows passing a transform, but it's easier to creating a temp canvas if strictly needed,
                // however, we can use the context directly with save/restore/translate.
                
                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                    transform: [scale, 0, 0, scale, xOffset, currentY] // [scaleX, skewY, skewX, scaleY, translateX, translateY]
                };
                
                // Note: The viewport itself already has the scale. 
                // If we pass the viewport to render, it tries to render at (0,0) of the canvas usually.
                // We need to use the `transform` parameter of renderContext or move the context.
                
                // Simpler approach compatible with all pdf.js versions: 
                // Render to a temporary canvas then drawImage to master. 
                // This is safer against context state pollution.
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = viewport.width;
                tempCanvas.height = viewport.height;
                const tempCtx = tempCanvas.getContext('2d');
                
                if (tempCtx) {
                    await page.render({ canvasContext: tempCtx, viewport }).promise;
                    context.drawImage(tempCanvas, xOffset, currentY);
                }

                currentY += viewport.height;
            }
            
            // Convert to base64 jpeg
            const base64String = canvas.toDataURL('image/jpeg', 0.85);
            const base64Data = base64String.split(',')[1];
            resolve(base64Data);
            
        } catch (error) {
            console.error("PDF Conversion error:", error);
            reject(error);
        }
    });
};

/**
 * Helper to convert file to base64
 */
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

interface ProcessedFile {
    aiBase64: string;      // The raw data to send to Gemini (Original PDF/Doc bytes)
    aiMimeType: string;    // The mime type for Gemini
    uiBase64: string;      // The image data to show in the UI (Stitched image)
    previewUrl: string;    // URL for <img src>
}

/**
 * Unifies file processing.
 */
export const processFile = async (file: File): Promise<ProcessedFile> => {
    // 1. Handle PDF
    if (file.type === 'application/pdf') {
        // For UI: Render all pages to one big image
        const stitchedImageBase64 = await convertPdfToImage(file);
        
        // For AI: Use the original PDF bytes (Gemini handles PDF natively and better)
        const originalPdfBase64 = await fileToGenerativePart(file);

        // Create blob for UI preview
        const byteCharacters = atob(stitchedImageBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });
        const previewUrl = URL.createObjectURL(blob);
        
        return { 
            aiBase64: originalPdfBase64, 
            aiMimeType: 'application/pdf',
            uiBase64: stitchedImageBase64, 
            previewUrl 
        };
    } 
    // 2. Handle DOC/DOCX (Experimental support for AI, but no UI preview)
    else if (file.name.match(/\.(doc|docx)$/i) || file.type === 'application/msword' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const originalDocBase64 = await fileToGenerativePart(file);
        
        // We cannot render DOCX in browser easily. We will return a placeholder for UI.
        // For AI, we send the original file. Gemini 1.5/2.5 often accepts application/pdf, 
        // strictly speaking direct DOCX support in `inlineData` varies. 
        // Best practice: Convert to PDF if possible, but here we try raw or rely on text extraction if needed.
        // However, standard Gemini Vision API expects Image or PDF. 
        // We will pass it, but if it fails, the user gets an error.
        
        // Placeholder image for UI (a simple colored box with text would be ideal, but here we use a transparent pixel or similar)
        // Let's create a canvas with text "Word Document"
        const canvas = document.createElement('canvas');
        canvas.width = 800;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(0,0,800,600);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '30px Inter';
            ctx.textAlign = 'center';
            ctx.fillText('Word Document Loaded', 400, 280);
            ctx.font = '20px Inter';
            ctx.fillText('Предпросмотр недоступен.', 400, 320);
            ctx.fillText(isAiAvailable ? 'AI проведет анализ содержимого файла.' : 'Для ручного замера сохраните документ как PDF.', 400, 350);
        }
        const placeholderBase64 = canvas.toDataURL('image/png').split(',')[1];
        const previewUrl = canvas.toDataURL('image/png');

        return {
            aiBase64: originalDocBase64,
            aiMimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            uiBase64: placeholderBase64,
            previewUrl
        };
    }
    // 3. Standard Image
    else {
        const base64 = await fileToGenerativePart(file);
        const previewUrl = URL.createObjectURL(file);
        return { 
            aiBase64: base64, 
            aiMimeType: file.type,
            uiBase64: base64, 
            previewUrl 
        };
    }
};

/**
 * Analyzes the image/pdf to calculate area composition and describe content.
 */
export const analyzeImageArea = async (aiBase64: string, aiMimeType: string): Promise<AnalysisData> => {
  try {
    const response = await getAiClient().models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: aiMimeType,
              data: aiBase64,
            },
          },
          {
            text: `Проанализируй этот проект (чертеж, план или документ).
            
            Задача: Рассчитать внутреннюю полезную площадь и оценить качество данных.
            
            1. Если это многостраничный PDF, проанализируй ВСЕ страницы, найди планы этажей и сложи их площади.
            2. Оцени реальную площадь в квадратных метрах (м²), если есть размеры или масштаб.
               В поле estimatedRealWorldArea верни строку вида: "~X м²".
               ВАЖНО: НЕ включай площадь стен. Ищи таблицы экспликации помещений, если есть.
            
            3. Оцени ДОСТОВЕРНОСТЬ анализа (confidenceScore) от 0 до 100.
            
            4. Верни JSON с полями summary, estimatedRealWorldArea, composition и confidenceScore.
            `,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            estimatedRealWorldArea: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER, description: "Score from 0 to 100 indicating analysis certainty" },
            composition: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  percentage: { type: Type.NUMBER },
                  description: { type: Type.STRING },
                  fill: { type: Type.STRING },
                },
                required: ["name", "percentage", "description", "fill"],
              },
            },
          },
          required: ["summary", "composition", "confidenceScore"],
        },
      },
    });

    if (!response.text) {
        throw new Error("No response from AI");
    }

    return JSON.parse(response.text) as AnalysisData;
  } catch (error) {
    console.error("Analysis failed:", error);
    throw error;
  }
};

/**
 * Enhances the image. Requires an Image MIME type (cannot enhance raw PDF bytes).
 * We will use the stitched UI image for this if the source was a PDF.
 */
export const enhanceImageQuality = async (imageBase64: string, mimeType: string): Promise<string> => {
  try {
    // Force mimeType to image/jpeg if it's pdf, as we are passing the stitched image
    const effectiveMimeType = mimeType === 'application/pdf' ? 'image/jpeg' : mimeType;

    const response = await getAiClient().models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: {
        parts: [
            {
                text: "Task: Rectify and Digitize this architectural plan. Transform to a perfectly flat, top-down orthographic view. Convert to high-contrast black and white style. Keep all text and dimensions."
            },
            {
                inlineData: {
                    mimeType: effectiveMimeType,
                    data: imageBase64
                }
            }
        ]
      },
    });

    let enhancedImageBase64 = "";
    const parts = response.candidates?.[0]?.content?.parts;
    
    if (parts) {
        for (const part of parts) {
            if (part.inlineData && part.inlineData.data) {
                enhancedImageBase64 = part.inlineData.data;
                break;
            }
        }
    }

    if (!enhancedImageBase64) {
        throw new Error("No image generated by the model.");
    }

    return enhancedImageBase64;

  } catch (error) {
    console.error("Enhancement failed:", error);
    throw error;
  }
};
