import { headers } from "next/headers";
import FamBridgeStudio from "@/components/fambridge-studio";

export const dynamic = "force-dynamic";

export default async function Home() {
  const requestHeaders = await headers();
  const hostId = requestHeaders.get("oai-authenticated-user-id");
  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  const hostName = encodedName
    ? decodeURIComponent(encodedName)
    : requestHeaders.get("oai-authenticated-user-email")?.split("@")[0] || "FamBridge Host";
  return <FamBridgeStudio hostAuthenticated={Boolean(hostId)} hostName={hostName} />;
}
