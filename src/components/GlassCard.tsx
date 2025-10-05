import { forwardRef } from 'react';
import { Card } from './ui/card';
import { useTheme } from './ThemeProvider';
import { cn } from './ui/utils';

interface GlassCardProps extends React.ComponentProps<'div'> {
  intensity?: 'light' | 'medium' | 'strong';
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, intensity = 'medium', children, ...props }, ref) => {
    const { glassStyle } = useTheme();

    const getGlassClasses = () => {
      if (glassStyle === 'opaque') {
        return 'bg-card border-border';
      }

      // Liquid glass effect
      const intensityClasses = {
        light: 'backdrop-blur-sm bg-white/25 dark:bg-white/8',
        medium: 'backdrop-blur-md bg-white/35 dark:bg-white/12',
        strong: 'backdrop-blur-lg bg-white/45 dark:bg-white/18'
      };

      return cn(
        'backdrop-blur-md border-white/25 dark:border-white/15',
        'bg-gradient-to-br from-white/35 to-white/15',
        'dark:from-white/12 dark:to-white/6',
        'shadow-xl shadow-black/8 dark:shadow-black/25',
        'before:absolute before:inset-0 before:rounded-[inherit]',
        'before:bg-gradient-to-br before:from-white/25 before:to-transparent',
        'before:dark:from-white/15 before:dark:to-transparent',
        'before:pointer-events-none before:transition-opacity before:duration-300',
        'hover:before:opacity-80',
        'after:absolute after:inset-0 after:rounded-[inherit]',
        'after:bg-gradient-to-br after:from-transparent after:via-white/8 after:to-white/15',
        'after:dark:from-transparent after:dark:via-white/4 after:dark:to-white/8',
        'after:pointer-events-none after:opacity-0 after:transition-opacity after:duration-500',
        'hover:after:opacity-100',
        'relative overflow-hidden transition-all duration-300',
        'hover:shadow-2xl hover:shadow-black/15 dark:hover:shadow-black/35',
        intensityClasses[intensity]
      );
    };

    return (
      <Card
        ref={ref}
        className={cn(getGlassClasses(), className)}
        {...props}
      >
        {children}
      </Card>
    );
  }
);

GlassCard.displayName = 'GlassCard';
 