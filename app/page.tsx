import { getChatGPTUser } from "@/app/chatgpt-auth";
import FamBridgeStudio from "@/components/fambridge-studio";
import HostLanding from "@/components/host-landing";
import HostSignInTracker from "@/components/host-signin-tracker";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ room?: string; invite?: string }> }) {
  const params = await searchParams;
  const isGuestInvite = Boolean(params.room && params.invite);
  const user = await getChatGPTUser();

  if (!isGuestInvite && !user) return <HostLanding />;

  return <>
    {user && !isGuestInvite && <HostSignInTracker />}
    <FamBridgeStudio hostAuthenticated={Boolean(user)} hostName={user?.displayName || "FamBridge Host"} />
  </>;
}
