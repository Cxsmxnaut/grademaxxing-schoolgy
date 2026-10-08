import SignInForm from "@/components/auth/SignInForm";
import PageMeta from "@/components/common/PageMeta";
import AuthLayout from "./AuthPageLayout";

export default function SignIn() {
  return (
    <>
      <PageMeta
        title="Sign in | Grademaxxing Admin"
        description="Private Grademaxxing operations console sign-in."
      />
      <AuthLayout>
        <SignInForm />
      </AuthLayout>
    </>
  );
}
