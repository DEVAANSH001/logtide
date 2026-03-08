<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
  import Monitor from '@lucide/svelte/icons/monitor';
</script>

<div class="space-y-6">
  <Card>
    <CardHeader>
      <div class="flex items-center gap-2">
        <Monitor class="h-5 w-5 text-muted-foreground" />
        <CardTitle>Session Explorer</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <div class="text-center py-12">
        <p class="text-lg text-muted-foreground mb-2">Coming soon</p>
        <p class="text-sm text-muted-foreground max-w-md mx-auto">
          Browse user sessions, view event timelines, and trace user journeys through your application.
          Sessions are automatically tracked when using the <code class="text-xs bg-muted px-1 py-0.5 rounded">@logtide/browser</code> SDK.
        </p>
      </div>
    </CardContent>
  </Card>
</div>
