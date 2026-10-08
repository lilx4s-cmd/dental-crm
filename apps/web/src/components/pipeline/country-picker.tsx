'use client';

import { useMemo, useState } from 'react';
import { countryOptions, searchCountries } from '@dental-crm/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function CountryPicker({ value = '', onChange, language = 'en', id }: {
  value?: string; onChange: (country: string) => void; language?: 'en' | 'ar'; id: string;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState('');
  const options = useMemo(() => countryOptions(language), [language]);
  const results = searchCountries(options, query);
  const selected = options.find(country => country.code === value);
  const unknown = language === 'ar' ? 'غير معروف بعد' : 'Not known yet';
  return <Popover open={open} onOpenChange={next => { setOpen(next); setQuery(''); }}>
    <PopoverTrigger asChild><Button type="button" variant="outline" id={id} role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-results`}
      aria-label={language === 'ar' ? 'دولة الإقامة' : 'Country of residence'} className="min-h-11 w-full justify-between text-base font-normal">
      <span className="truncate">{selected ? `${selected.name} · ${selected.code}` : value || unknown}</span><span aria-hidden="true">⌄</span>
    </Button></PopoverTrigger>
    <PopoverContent align="start" dir={language === 'ar' ? 'rtl' : 'ltr'} className="w-[min(22rem,calc(100vw-3rem))] space-y-2 p-3">
      <Input type="search" autoFocus value={query} onChange={event => setQuery(event.target.value)}
        aria-label={language === 'ar' ? 'البحث عن دولة' : 'Search countries'}
        placeholder={language === 'ar' ? 'اسم الدولة أو رمزها' : 'Country name or code'} className="min-h-11 text-base" />
      <select id={`${id}-results`} aria-label={language === 'ar' ? 'نتائج البحث عن الدول' : 'Country results'} size={7} value={value}
        className="w-full rounded-md border bg-background p-2 text-base" onChange={event => { onChange(event.target.value); setOpen(false); }}>
        <option value="">{unknown}</option>
        {value && !results.some(country => country.code === value) && <option value={value} hidden>{selected?.name ?? value}</option>}
        {results.map(country => <option key={country.code} value={country.code}>{country.name} · {country.code}</option>)}
      </select>
      {!results.length && <p className="text-sm" role="status">{language === 'ar' ? 'لا توجد نتائج' : 'No matching countries'}</p>}
    </PopoverContent>
  </Popover>;
}
