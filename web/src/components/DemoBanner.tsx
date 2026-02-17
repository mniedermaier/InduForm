export default function DemoBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[300] bg-amber-500 text-amber-950 text-center text-sm font-medium py-1.5 px-4 shadow-md">
      Limited Demo — Static preview with mock data. No changes are saved.{' '}
      <a
        href="https://github.com/mniedermaier/InduForm"
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-semibold hover:text-amber-800"
      >
        View on GitHub &rarr;
      </a>
    </div>
  );
}
