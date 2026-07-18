import { LoginForm } from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-4">
            🦷
          </div>
          <h1 className="text-3xl font-bold text-foreground">Dental CRM</h1>
          <p className="text-muted-foreground mt-2">Sign in to your clinic dashboard</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
