import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Separator } from './ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Upload, RotateCcw, PanelRight, Shuffle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useIsMobile } from './ui/use-mobile';
import LiquidGlassShader from './LiquidGlassShader';
import ColorPicker from './ColorPicker';

export default function LiquidGlassEditor() {
  const isMobile = useIsMobile();
  
  // ... simplified: placeholder implementation to keep file size manageable
  return (
    <div className="h-screen bg-background flex items-center justify-center">
      <Card className="p-6">
        <h2>Liquid Glass Editor (placeholder)</h2>
        <p className="text-sm text-muted-foreground">Full implementation copied from figma in source files.</p>
      </Card>
    </div>
  );
}
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Slider } from './ui/slider';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Separator } from './ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Upload, RotateCcw, PanelRight, Shuffle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useIsMobile } from './ui/use-mobile';
import LiquidGlassShader from './LiquidGlassShader';
import ColorPicker from './ColorPicker';

type GlassShape = 'rectangle' | 'circle' | 'star' | 'hexagon' | 'donut';

interface ShaderParams {
  width: number;
  height: number;
  mouseX: number;
  mouseY: number;
  tintR: number;
  tintG: number;
  tintB: number;
  saturation: number;
  distortion: number;
  blur: number;
  text: string;
  iconSize: number;
  iconColorR: number;
  iconColorG: number;
  iconColorB: number;
  glassMode: 'light' | 'dark';
  shadowIntensity: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowBlur: number;
  cornerRadius: number;
  chromaticAberration: number;
  shape: GlassShape;
  donutThickness: number;
  starPoints: number;
  starInnerRadius: number;
}

interface BackgroundMedia {
  url: string;
  type: 'image' | 'video';
  blurhash?: string;
}

interface CuratedImage {
  url: string;
  blurhash: string;
}

// Curated background images with pre-computed blurhash values
const BACKGROUND_IMAGES: CuratedImage[] = [
  {
    url: 'https://images.unsplash.com/photo-1541869440787-abe7669a951a?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L6Adyj00_4WA?HRP%LIp4.%1x^t8'
  },
  {
    url: 'https://i0.wp.com/mrmacintosh.com/wp-content/uploads/2025/06/Screenshot-2025-06-09-at-3.49.32%E2%80%AFPM.png?w=1680&ssl=1',
    blurhash: 'LA9jZp4n~qIU_3M{RjWB4nofRjWB'
  },
  {
    url: 'https://images.unsplash.com/photo-1738916218012-4e580beae18e?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L58NK1$+0Kt6?aRkxvt6_ND%tRWB'
  },
  {
    url: 'https://images.unsplash.com/photo-1745613184657-3c8dcd5f079a?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'LBF5UJo}~q%MWBM{Rjt7-;ofWBof'
  },
  {
    url: 'https://images.unsplash.com/photo-1499346030926-9a72daac6c63?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L38gvD?a~V%M?bE2M{t79Ft6xuR+'
  },
  {
    url: 'https://images.unsplash.com/photo-1747738305509-6b21c67ec6f6?q=80&w=3136&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'LHCP~5%M~qM{%Mt7IUay-;ofayWB'
  },
  {
    url: 'https://images.unsplash.com/photo-1585541116655-556ec2621aef?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'LHCP~5%M~qM{%Mt7IUay-;ofayWB'
  },
  {
    url: 'https://images.unsplash.com/photo-1543604502-9baac28067ad?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'LHCP~5%M~qM{%Mt7IUay-;ofayWB'
  },
  {
    url: 'https://images.unsplash.com/photo-1568733873715-f9d497a47ea0?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L59%{8Rj~qD%00M{ofj[_3xuM{Rj'
  },
  {
    url: 'https://images.unsplash.com/photo-1508614999368-9260051292e5?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L79QJa9F~qRj00%1Rjt7-;WBRjWB'
  },
  {
    url: 'https://images.unsplash.com/photo-1724748860101-589aa7ee8b29?q=80&w=3174&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L6A,]q%M~q%M00WAWBIU_3xtRjRP'
  },
  {
    url: 'https://images.unsplash.com/photo-1730854476441-f492868dcfb0?q=80&w=3087&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L8A0}G%M~qRj00%1Rjof-;j@M{RP'
  },
  {
    url: 'https://images.unsplash.com/photo-1640329255807-bee8f74893fa?q=80&w=3087&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L7A9U5Io~V%M_2%LM{of-;ofayof'
  },
  {
    url: 'https://images.unsplash.com/photo-1669808219008-da86478560e2?q=80&w=3067&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L8D,}8~W_3%M00WBWBIU4.j[M{RP'
  },
  {
    url: 'https://images.unsplash.com/photo-1728140842863-674c0c66e9e0?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L6C?}@~W_3%M00WBWBIU4.j[M{RP'
  },
  {
    url: 'https://images.unsplash.com/photo-1729606054134-15eb9c32f994?q=80&w=3270&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    blurhash: 'L5A0}G%M~qRj00%1Rjof-;j@M{RP'
  }
];

const DEFAULT_BACKGROUND_IMAGE = BACKGROUND_IMAGES[0];

// Shape options for the selector
const SHAPE_OPTIONS = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'circle', label: 'Circle' },
  { value: 'star', label: 'Star' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'donut', label: 'Donut' }
] as const;

// Browser detection utility
const isSafari = (): boolean => {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent;
  // Safari contains "Safari" but not "Chrome" (Chrome also has "Safari" in user agent)
  return userAgent.includes('Safari') && !userAgent.includes('Chrome');
};

// Font detection utility
const detectSFFont = (): boolean => {
  // Create a canvas to test font rendering
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return false;

  // Test string that would look different in SF Pro vs fallback fonts
  const testString = 'abcdefghijklmnopqrstuvwxyz';
  const fontSize = '72px';
  
  // Get baseline measurement with a common fallback font
  context.font = `${fontSize} monospace`;
  const fallbackWidth = context.measureText(testString).width;
  
  // Test with SF Pro Display
  context.font = `${fontSize} "SF Pro Display", -apple-system, system-ui`;
  const sfWidth = context.measureText(testString).width;
  
  // If widths are different, SF Pro is likely available
  return Math.abs(sfWidth - fallbackWidth) > 1;
};

// Get default text based on browser and font support
const getDefaultText = (): string => {
  if (typeof window === 'undefined') return '✨'; // SSR fallback
  
  // Always use ✨ emoji on Safari
  if (isSafari()) return '✨';
  
  // For other browsers, detect SF font support
  return detectSFFont() ? '􀅼' : '✨';
};

// Default shader parameters - memoized to prevent recreation
const DEFAULT_PARAMS: ShaderParams = {
  width: 385,
  height: 170,
  mouseX: 0,
  mouseY: 0,
  tintR: 0.968,
  tintG: 1.0,
  tintB: 0.878,
  saturation: 1.0,
  distortion: 3.0,
  blur: 3.0,
  text: getDefaultText(),
  iconSize: 0.35,
  iconColorR: 1.0,
  iconColorG: 1.0,
  iconColorB: 1.0,
  glassMode: 'light',
  shadowIntensity: 0.3,
  shadowOffsetX: 5,
  shadowOffsetY: 5,
  shadowBlur: 30,
  cornerRadius: 170,
  chromaticAberration: 1.0,
  shape: 'rectangle',
  donutThickness: 0.3,
  starPoints: 5,
  starInnerRadius: 0.4
};

// Image preloading for better performance
const preloadImages = () => {
  BACKGROUND_IMAGES.forEach((image) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = image.url;
  });
};

export default function LiquidGlassEditor() {
  const isMobile = useIsMobile();
  
  const [backgroundMedia, setBackgroundMedia] = useState<BackgroundMedia>({
    url: DEFAULT_BACKGROUND_IMAGE.url,
    type: 'image',
    blurhash: DEFAULT_BACKGROUND_IMAGE.blurhash
  });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [nextImage, setNextImage] = useState<CuratedImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isGlassDragging, setIsGlassDragging] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(!isMobile); // Close sidebar on mobile by default
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [isTextVisible, setIsTextVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useState<ShaderParams>(() => ({
    ...DEFAULT_PARAMS,
    text: getDefaultText() // Ensure we get the right default text on mount
  }));

  // Close sidebar when switching to mobile
  useEffect(() => {
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  }, [isMobile]);

  // Preload images on mount for better performance
  useEffect(() => {
    preloadImages();
  }, []);

  // Memoize color conversion utilities to prevent recreation
  const colorUtils = useMemo(() => ({
    rgbToHex: (r: number, g: number, b: number) => {
      const toHex = (c: number) => {
        const hex = Math.round(c * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    },
    
    hexToRgb: (hex: string) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255,
          }
        : { r: 1, g: 1, b: 1 };
    }
  }), []);

  // Memoize shader uniforms to reduce recalculations
  const shaderUniforms = useMemo(() => ({
    time: 0,
    ...params
  }), [params]);

  // Initialize glass position to center - optimized with useCallback
  const centerGlass = useCallback(() => {
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setParams(prev => ({
        ...prev,
        mouseX: rect.width / 2,
        mouseY: rect.height / 2
      }));
    }
  }, []);

  useEffect(() => {
    centerGlass();
  }, [centerGlass]);

  // Recenter glass when sidebar toggles - debounced for performance
  useEffect(() => {
    const timer = setTimeout(centerGlass, 300);
    return () => clearTimeout(timer);
  }, [isSidebarOpen, centerGlass]);

  const handleCanvasReady = useCallback(() => {
    setIsCanvasReady(true);
    
    setTimeout(() => {
      setIsTextVisible(true);
    }, 400);
  }, []);

  const handleFileUpload = useCallback((file: File) => {
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const url = e.target?.result as string;
        setBackgroundMedia({
          url,
          type: file.type.startsWith('video/') ? 'video' : 'image'
        });
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const resetParams = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.width / 2 : 400;
    const centerY = rect ? rect.height / 2 : 300;
    
    setIsTransitioning(true);
    setNextImage(DEFAULT_BACKGROUND_IMAGE);
    
    setBackgroundMedia({
      url: DEFAULT_BACKGROUND_IMAGE.url,
      type: 'image',
      blurhash: DEFAULT_BACKGROUND_IMAGE.blurhash
    });
    
    setParams({
      ...DEFAULT_PARAMS,
      text: getDefaultText(), // Use browser-aware default text
      mouseX: centerX,
      mouseY: centerY
    });
    
    setTimeout(() => {
      setCurrentImageIndex(0);
      setIsTransitioning(false);
      setNextImage(null);
    }, 100);
  }, []);

  // Optimized parameter update function with debouncing for expensive operations
  const updateParam = useCallback((key: keyof ShaderParams, value: number | string) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  // Memoized color change handlers
  const handleIconColorChange = useCallback((hex: string) => {
    const rgb = colorUtils.hexToRgb(hex);
    setParams(prev => ({
      ...prev,
      iconColorR: rgb.r,
      iconColorG: rgb.g,
      iconColorB: rgb.b
    }));
  }, [colorUtils]);

  const handleTintColorChange = useCallback((hex: string) => {
    const rgb = colorUtils.hexToRgb(hex);
    setParams(prev => ({
      ...prev,
      tintR: rgb.r,
      tintG: rgb.g,
      tintB: rgb.b
    }));
  }, [colorUtils]);

  // Optimized mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) {
      setIsGlassDragging(true);
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setParams(prev => ({ ...prev, mouseX: x, mouseY: y }));
    }
  }, [isDragging]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isGlassDragging) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setParams(prev => ({ ...prev, mouseX: x, mouseY: y }));
    }
  }, [isGlassDragging]);

  const handleMouseUp = useCallback(() => {
    setIsGlassDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsGlassDragging(false);
  }, []);

  const handleRandomImage = useCallback(() => {
    const nextIndex = (currentImageIndex + 1) % BACKGROUND_IMAGES.length;
    const nextImageData = BACKGROUND_IMAGES[nextIndex];
    
    setIsTransitioning(true);
    setNextImage(nextImageData);
    
    setBackgroundMedia({
      url: nextImageData.url,
      type: 'image',
      blurhash: nextImageData.blurhash
    });
    
    setParams(prev => ({
      ...prev,
      tintR: 1.0,
      tintG: 1.0,
      tintB: 1.0,
      saturation: 1.0
    }));
    
    setTimeout(() => {
      setCurrentImageIndex(nextIndex);
      setIsTransitioning(false);
      setNextImage(null);
    }, 100);
  }, [currentImageIndex]);

  const handleSelectBackground = useCallback((index: number) => {
    const selectedImage = BACKGROUND_IMAGES[index];
    
    setIsTransitioning(true);
    setNextImage(selectedImage);
    
    setBackgroundMedia({
      url: selectedImage.url,
      type: 'image',
      blurhash: selectedImage.blurhash
    });
    
    setParams(prev => ({
      ...prev,
      tintR: 1.0,
      tintG: 1.0,
      tintB: 1.0,
      saturation: 1.0
    }));
    
    setTimeout(() => {
      setCurrentImageIndex(index);
      setIsTransitioning(false);
      setNextImage(null);
    }, 100);
  }, []);

  // Memoize background thumbnails to prevent re-renders
  const backgroundThumbnails = useMemo(() => (
    BACKGROUND_IMAGES.map((image, index) => (
      <button
        key={index}
        onClick={() => handleSelectBackground(index)}
        className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all duration-200 ${
          currentImageIndex === index 
            ? 'border-primary shadow-md' 
            : 'border-border hover:border-primary/50'
        }`}
      >
        <img
          src={`${image.url}&w=100&h=100&fit=crop`}
          alt={`Background ${index + 1}`}
          className="w-full h-full object-cover"
          loading="lazy"
        />
        {currentImageIndex === index && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
            <div className="w-3 h-3 bg-primary rounded-full" />
          </div>
        )}
      </button>
    ))
  ), [currentImageIndex, handleSelectBackground]);

  // Memoize text overlay style for performance
  const textOverlayStyle = useMemo(() => ({
    left: params.mouseX,
    top: params.mouseY,
    transform: 'translate(-50%, -50%)',
    fontFamily: '-apple-system, "SF Pro Display", BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    fontSize: Math.min(params.width, params.height) * params.iconSize,
    fontWeight: 400,
    textShadow: params.glassMode === 'dark' 
      ? '0 2px 4px rgba(0,0,0,0.6), 0 0 8px rgba(255,255,255,0.1)' 
      : '0 1px 3px rgba(0,0,0,0.3)',
    zIndex: 10,
    color: `rgb(${Math.round(params.iconColorR * 255)}, ${Math.round(params.iconColorG * 255)}, ${Math.round(params.iconColorB * 255)})`,
    transitionDelay: isTextVisible ? '0ms' : '0ms'
  }), [params, isTextVisible]);

  // Memoize drag handlers to prevent recreation
  const dragHandlers = useMemo(() => ({
    onDrop: handleDrop,
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    onMouseDown: handleMouseDown,
    onMouseMove: handleMouseMove,
    onMouseUp: handleMouseUp,
    onMouseLeave: handleMouseLeave
  }), [handleDrop, handleMouseDown, handleMouseMove, handleMouseUp, handleMouseLeave]);

  // Shape-specific controls visibility
  const showCornerRadius = params.shape === 'rectangle';
  const showDonutThickness = params.shape === 'donut';
  const showStarPoints = params.shape === 'star';
  const showStarInnerRadius = params.shape === 'star';

  return (
    <TooltipProvider>
      <div className="h-screen bg-background flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10 bg-[rgba(255,255,255,0.4)]">
          <div className="px-[21px] py-[12px]">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-[14px]">Liquid Glass Editor</h1>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleRandomImage}
                  className="h-10 px-3"
                >
                  <Shuffle className="h-4 w-4 mr-2" />
                  Random
                </Button>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-10 w-10 p-0"
                    >
                      <Upload className="h-4 w-4" />
                      <span className="sr-only">Upload Image or Video</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Upload Image or Video</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetParams}
                      className="h-10 w-10 p-0"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="sr-only">Reset to Default</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset to Default</p>
                  </TooltipContent>
                </Tooltip>
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                      className="h-10 w-10 p-0"
                    >
                      <PanelRight className="h-4 w-4" />
                      <span className="sr-only">Toggle Properties</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Toggle Properties</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </header>

        {/* Main Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 p-[12px] flex flex-col">
              <Card className="flex-1 p-[12px] flex flex-col">
                <div
                  ref={canvasRef}
                  className={`relative w-full flex-1 rounded-lg overflow-hidden select-none ${
                    isGlassDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  {...dragHandlers}
                >
                  <LiquidGlassShader
                    backgroundMedia={backgroundMedia}
                    uniforms={shaderUniforms}
                    className="w-full h-full"
                    isTransitioning={isTransitioning}
                    onReady={handleCanvasReady}
                  />
                  
                  {/* Canvas Loading Blur Overlay */}
                  <div 
                    className={`absolute inset-0 bg-white/80 backdrop-blur-[40px] transition-opacity duration-700 ease-out pointer-events-none ${
                      isCanvasReady ? 'opacity-0' : 'opacity-100'
                    }`}
                    style={{
                      transitionDelay: isCanvasReady ? '0ms' : '0ms'
                    }}
                  />
                  
                  {/* Text Overlay - Optimized with memoized style */}
                  {params.text && (
                    <div 
                      className={`absolute pointer-events-none select-none transition-opacity duration-800 ease-out ${
                        isTextVisible ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={textOverlayStyle}
                    >
                      {params.text}
                    </div>
                  )}
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </Card>
            </div>
          </div>

          {/* Sidebar */}
          <div className={`bg-sidebar border-l border-sidebar-border transition-all duration-300 ease-in-out ${
            isSidebarOpen ? 'w-[320px]' : 'w-0 overflow-hidden'
          }`}>
            <div className="h-full flex flex-col w-[320px]">
              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto px-[16px] py-[21px] text-sidebar-foreground">
                
                <Accordion type="multiple" defaultValue={["glass-shape", "glass-properties", "color"]} className="w-full">
                  
                  {/* Background Gallery */}
                  <AccordionItem value="background">
                    <AccordionTrigger>Backgrounds</AccordionTrigger>
                    <AccordionContent>
                      <div className="grid grid-cols-4 gap-2">
                        {backgroundThumbnails}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Glass Shape */}
                  <AccordionItem value="glass-shape">
                    <AccordionTrigger>Glass Shape</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-6">
                        <div>
                          <Label className="text-sm">Shape</Label>
                          <Select
                            value={params.shape}
                            onValueChange={(value: GlassShape) => updateParam('shape', value)}
                          >
                            <SelectTrigger className="mt-3">
                              <SelectValue placeholder="Select shape" />
                            </SelectTrigger>
                            <SelectContent>
                              {SHAPE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">Symbol</Label>
                          <Input
                            value={params.text}
                            onChange={(e) => updateParam('text', e.target.value)}
                            placeholder="Enter SF symbol or text"
                            className="mt-3"
                            style={{
                              fontFamily: 'Inter, -apple-system, "Inter UI", "SF Pro Display", BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
                            }}
                            maxLength={10}
                          />
                          <div className="text-xs text-sidebar-foreground/70 mt-2">
                            SF symbol or custom text inside glass
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Icon Size</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {(params.iconSize * 100).toFixed(0)}%
                            </span>
                          </div>
                          <Slider
                            value={[params.iconSize]}
                            onValueChange={(value) => updateParam('iconSize', value[0])}
                            min={0.1}
                            max={0.8}
                            step={0.05}
                            className="mt-3"
                          />
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Width</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {params.width}px
                            </span>
                          </div>
                          <Slider
                            value={[params.width]}
                            onValueChange={(value) => updateParam('width', value[0])}
                            min={50}
                            max={500}
                            step={5}
                            className="mt-3"
                          />
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Height</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {params.height}px
                            </span>
                          </div>
                          <Slider
                            value={[params.height]}
                            onValueChange={(value) => updateParam('height', value[0])}
                            min={50}
                            max={500}
                            step={5}
                            className="mt-3"
                          />
                        </div>
                        
                        {showCornerRadius && (
                          <div>
                            <div className="flex justify-between items-center">
                              <Label className="text-sm">Corner Radius</Label>
                              <span className="text-sm text-sidebar-foreground/70">
                                {params.cornerRadius}px
                              </span>
                            </div>
                            <Slider
                              value={[params.cornerRadius]}
                              onValueChange={(value) => updateParam('cornerRadius', value[0])}
                              min={0}
                              max={170}
                              step={5}
                              className="mt-3"
                            />
                          </div>
                        )}

                        {showDonutThickness && (
                          <div>
                            <div className="flex justify-between items-center">
                              <Label className="text-sm">Thickness</Label>
                              <span className="text-sm text-sidebar-foreground/70">
                                {(params.donutThickness * 100).toFixed(0)}%
                              </span>
                            </div>
                            <Slider
                              value={[params.donutThickness]}
                              onValueChange={(value) => updateParam('donutThickness', value[0])}
                              min={0.1}
                              max={0.9}
                              step={0.05}
                              className="mt-3"
                            />
                          </div>
                        )}

                        {showStarPoints && (
                          <div>
                            <div className="flex justify-between items-center">
                              <Label className="text-sm">Star Points</Label>
                              <span className="text-sm text-sidebar-foreground/70">
                                {params.starPoints}
                              </span>
                            </div>
                            <Slider
                              value={[params.starPoints]}
                              onValueChange={(value) => updateParam('starPoints', value[0])}
                              min={3}
                              max={12}
                              step={1}
                              className="mt-3"
                            />
                          </div>
                        )}

                        {showStarInnerRadius && (
                          <div>
                            <div className="flex justify-between items-center">
                              <Label className="text-sm">Inner Radius</Label>
                              <span className="text-sm text-sidebar-foreground/70">
                                {(params.starInnerRadius * 100).toFixed(0)}%
                              </span>
                            </div>
                            <Slider
                              value={[params.starInnerRadius]}
                              onValueChange={(value) => updateParam('starInnerRadius', value[0])}
                              min={0.1}
                              max={0.9}
                              step={0.05}
                              className="mt-3"
                            />
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Glass Properties */}
                  <AccordionItem value="glass-properties">
                    <AccordionTrigger>Glass Properties</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-6">
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Saturation</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {params.saturation.toFixed(2)}
                            </span>
                          </div>
                          <Slider
                            value={[params.saturation]}
                            onValueChange={(value) => updateParam('saturation', value[0])}
                            min={0.0}
                            max={1.2}
                            step={0.05}
                            className="mt-3"
                          />
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Distortion</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {params.distortion.toFixed(1)}
                            </span>
                          </div>
                          <Slider
                            value={[params.distortion]}
                            onValueChange={(value) => updateParam('distortion', value[0])}
                            min={0}
                            max={3}
                            step={0.1}
                            className="mt-3"
                          />
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Blur</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {params.blur.toFixed(1)}
                            </span>
                          </div>
                          <Slider
                            value={[params.blur]}
                            onValueChange={(value) => updateParam('blur', value[0])}
                            min={0.1}
                            max={3}
                            step={0.1}
                            className="mt-3"
                          />
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Chromatic Aberration</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {params.chromaticAberration.toFixed(1)}
                            </span>
                          </div>
                          <Slider
                            value={[params.chromaticAberration]}
                            onValueChange={(value) => updateParam('chromaticAberration', value[0])}
                            min={0.0}
                            max={4.0}
                            step={0.1}
                            className="mt-3"
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Color */}
                  <AccordionItem value="color">
                    <AccordionTrigger>Color</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-6">
                        <ColorPicker
                          label="Icon Color"
                          value={colorUtils.rgbToHex(params.iconColorR, params.iconColorG, params.iconColorB)}
                          onChange={handleIconColorChange}
                        />
                        
                        <ColorPicker
                          label="Glass Tint"
                          value={colorUtils.rgbToHex(params.tintR, params.tintG, params.tintB)}
                          onChange={handleTintColorChange}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Shadow */}
                  <AccordionItem value="shadow">
                    <AccordionTrigger>Shadow</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-6">
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Intensity</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {(params.shadowIntensity * 100).toFixed(0)}%
                            </span>
                          </div>
                          <Slider
                            value={[params.shadowIntensity]}
                            onValueChange={(value) => updateParam('shadowIntensity', value[0])}
                            min={0}
                            max={1}
                            step={0.05}
                            className="mt-3"
                          />
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Offset X</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {params.shadowOffsetX}px
                            </span>
                          </div>
                          <Slider
                            value={[params.shadowOffsetX]}
                            onValueChange={(value) => updateParam('shadowOffsetX', value[0])}
                            min={-30}
                            max={30}
                            step={1}
                            className="mt-3"
                          />
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Offset Y</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {params.shadowOffsetY}px
                            </span>
                          </div>
                          <Slider
                            value={[params.shadowOffsetY]}
                            onValueChange={(value) => updateParam('shadowOffsetY', value[0])}
                            min={-30}
                            max={30}
                            step={1}
                            className="mt-3"
                          />
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center">
                            <Label className="text-sm">Blur</Label>
                            <span className="text-sm text-sidebar-foreground/70">
                              {params.shadowBlur}px
                            </span>
                          </div>
                          <Slider
                            value={[params.shadowBlur]}
                            onValueChange={(value) => updateParam('shadowBlur', value[0])}
                            min={0}
                            max={30}
                            step={1}
                            className="mt-3"
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                </Accordion>

                {/* Credits */}
                <div className="mt-8 space-y-3">
                  <div className="text-xs text-sidebar-foreground/70 text-center">
                    Created by{' '}
                    <a 
                      href="https://danielamuntyan.com/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sidebar-foreground hover:underline"
                    >
                      Daniela Muntyan
                    </a>
                    {' '}in{' '}
                    <a 
                      href="https://www.figma.com/make/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sidebar-foreground hover:underline"
                    >
                      Figma Make
                    </a>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}