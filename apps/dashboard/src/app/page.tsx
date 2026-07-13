'use client';

export default function Home() {
  return (
    <div>
      <h1 className="text-4xl font-bold mb-4">Welcome to Job Application Copilot</h1>
      <p className="text-lg text-gray-700 mb-6">
        Discover, evaluate, score, and submit job applications intelligently.
      </p>
      <p className="text-gray-600 mb-8">
        Use the navigation menu to access jobs, applications, and the dashboard.
      </p>
      <a href="/dashboard" className="button button-primary">
        Go to Dashboard
      </a>
    </div>
  );
}
