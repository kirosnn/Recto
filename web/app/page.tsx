import { createClient } from "../lib/supabase-server";
import MainContent from "../components/MainContent";

export default async function Page() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <MainContent user={user} />;
}
