import { clsx } from 'clsx';
export function Button({ as:Comp='button', className='', variant='default', size='md', ...props }){
const base = 'inline-flex items-center justify-center rounded-2xl font-medium transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none';
const variants = {
default: 'bg-black text-white hover:opacity-90',
outline: 'border border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800',
ghost: 'hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800'
};
const sizes = { sm:'h-9 px-3 text-sm', md:'h-10 px-4', lg:'h-11 px-5 text-lg' };
return <Comp className={clsx(base, variants[variant], sizes[size], className)} {...props} />
}
