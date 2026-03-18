export default function SetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Setup</h1>
        <p className="text-gray-600">
          Setup wizard coming soon. Set <code>setup_complete</code> to{' '}
          <code>true</code> in <code>site_config</code> to bypass.
        </p>
      </div>
    </div>
  );
}
