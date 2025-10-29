import { useEffect, useState } from 'react';

interface AppLoaderProps {
  isLoading: boolean;
}

export default function AppLoader({ isLoading }: AppLoaderProps) {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (!isLoading) {
      setOpacity(0);
    }
  }, [isLoading]);

  if (!isLoading && opacity === 0) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-background/80 transition-opacity duration-300"
      style={{ opacity }}
    >
      <div className="text-center">
        {/* App Name */}
        <h1 className="text-sm mb-4 text-foreground">
          Liquid Glass Editor
        </h1>
        
        {/* Simple Spinner */}
        <div className="w-4 h-4 mx-auto border-2 border-muted border-t-foreground rounded-full animate-spin" />
      </div>
    </div>
  );
}