export function Input(props) {
  return (
    <input
      {...props}
      className={
        (props.className || "") +
        " w-full h-10 px-3 rounded-xl border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-black dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-100 dark:placeholder-neutral-400 dark:focus:ring-white"
      }
    />
  );
}
