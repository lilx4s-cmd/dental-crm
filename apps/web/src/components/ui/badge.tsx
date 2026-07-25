import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Every variant reads a semantic token rather than the raw palette. These used to be written as
// `bg-green-100 text-green-800 dark:bg-green-900/30`, and each caller elsewhere in the app then
// re-invented the same idea slightly differently — the result was five greens all meaning "good"
// and both amber and yellow meaning "warning".
const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive-muted text-destructive-muted-foreground',
        outline: 'border border-input text-foreground',
        success: 'bg-success-muted text-success-muted-foreground',
        warning: 'bg-warning-muted text-warning-muted-foreground',
        info: 'bg-info-muted text-info-muted-foreground',
        // Neutral accent, no status meaning attached — kept for existing callers.
        purple: 'bg-accent text-accent-foreground',
        // Solid fills, for when a status has to carry the emphasis on its own.
        successSolid: 'bg-success text-success-foreground',
        warningSolid: 'bg-warning text-warning-foreground',
        destructiveSolid: 'bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
