import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center dark:bg-gray-900">
      <p className="text-7xl font-bold text-brand-500">404</p>
      <h1 className="mt-4 text-title-xl font-semibold text-gray-800 dark:text-white/90">
        Page not found
      </h1>
      <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
        This console page does not exist — maybe it moved behind the new
        navigation.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-brand-600"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
