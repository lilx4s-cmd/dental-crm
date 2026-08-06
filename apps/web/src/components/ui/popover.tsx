'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

/**
 * A panel anchored to a trigger, for content rather than for a list of actions.
 *
 * `DropdownMenu` is the neighbouring primitive and the wrong one here: its items are menu items,
 * which means arrow-key navigation, type-ahead that fights a search box, and a close on every
 * selection. A tag picker needs a text input and several ticks before it is done, so it wants a
 * popover — a plain panel that stays open until dismissed.
 */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      // Portalled, so a picker opened from inside a card that has `overflow: hidden` — which every
      // kanban column does — is not clipped by it.
      className={cn(
        'z-50 rounded-md border bg-popover text-popover-foreground shadow-md outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
