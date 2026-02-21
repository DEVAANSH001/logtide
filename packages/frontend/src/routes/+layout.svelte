<script lang="ts">
  import "../app.css";
  import { Toaster } from "$lib/components/ui/sonner";
  import { ProgressBar } from "@prgm/sveltekit-progress-bar";
  import { afterNavigate } from "$app/navigation";
  import { hub } from "@logtide/core";

  // Track client-side navigations as page views
  afterNavigate(({ to, type }) => {
    const client = hub.getClient();
    if (!client || !to?.url) return;

    client.captureLog('info', `pageview ${to.url.pathname}`, {
      'page.url': to.url.href,
      'page.pathname': to.url.pathname,
      'navigation.type': type,
    });
  });
</script>

<ProgressBar class="text-primary" zIndex={100} />
<Toaster />
<slot />
