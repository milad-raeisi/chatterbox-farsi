/** Quiet page backdrop: a faint girih (گره‌چینی) lattice, no coloured light. */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <div className="girih absolute inset-0 opacity-[0.05] dark:opacity-[0.045]" />
    </div>
  );
}
