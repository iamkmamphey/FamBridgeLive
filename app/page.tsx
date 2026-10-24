import { getHostSession } from "@/lib/host-auth";
import FamBridgeStudio from "@/components/fambridge-studio";
import HostLanding from "@/components/host-landing";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ room?: string; invite?: string }> }) {
  const params = await searchParams;
  const isGuestInvite = Boolean(params.room && params.invite);
  const host = await getHostSession();

  if (!isGuestInvite && !host) return <HostLanding />;

  return <FamBridgeStudio hostAuthenticated={Boolean(host)} hostName={host?.name || "FamBridge Host"} />;
}
