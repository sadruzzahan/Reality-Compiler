import {
  useGetAdminMe,
  getGetAdminMeQueryKey,
} from "@workspace/api-client-react";
import { useUser } from "@clerk/react";

export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean } {
  const { isSignedIn, isLoaded } = useUser();
  const { data, isLoading } = useGetAdminMe({
    query: {
      queryKey: getGetAdminMeQueryKey(),
      enabled: !!isSignedIn,
      staleTime: 60_000,
    },
  });
  if (!isLoaded || !isSignedIn) return { isAdmin: false, isLoading: !isLoaded };
  return { isAdmin: data?.isAdmin ?? false, isLoading };
}
