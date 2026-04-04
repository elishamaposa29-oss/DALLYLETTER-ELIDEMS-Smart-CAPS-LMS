export default function SuspendedPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-4">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
          <span className="text-2xl font-bold text-destructive">!</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Account Suspended</h1>
        <p className="text-muted-foreground">
          Your account has been temporarily suspended. This may be due to overdue payments or a violation of school policies.
        </p>
        <p className="text-sm">
          Please contact administration for assistance.
        </p>
      </div>
    </div>
  );
}
