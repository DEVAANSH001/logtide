<script lang="ts">
  import { Building2 } from '@lucide/svelte';

  interface Props {
    icon: string | null;
    class?: string;
  }

  let { icon, class: className = 'h-4 w-4' }: Props = $props();
</script>

{#if icon === 'google'}
  <svg class={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
{:else if icon === 'microsoft'}
  <svg class={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M11.4 11.4H0V0h11.4v11.4z" fill="#F25022"/>
    <path d="M24 11.4H12.6V0H24v11.4z" fill="#7FBA00"/>
    <path d="M11.4 24H0V12.6h11.4V24z" fill="#00A4EF"/>
    <path d="M24 24H12.6V12.6H24V24z" fill="#FFB900"/>
  </svg>
{:else if icon === 'github'}
  <svg class={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill="currentColor"/>
  </svg>
{:else if icon === 'gitlab'}
  <svg class={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 00-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 00-.867 0L1.386 9.45.044 13.587a.924.924 0 00.331 1.023L12 23.054l11.625-8.444a.924.924 0 00.33-1.023" fill="#E24329"/>
    <path d="M12 23.054l4.418-13.605H7.582L12 23.054z" fill="#FC6D26"/>
    <path d="M12 23.054l-4.418-13.605H1.386L12 23.054zM.044 13.587l-1.342-4.135 2.684-8.189a.455.455 0 01.867 0l2.664 8.189H.044z" fill="#FCA326"/>
    <path d="M23.956 13.587l1.342-4.135-2.684-8.189a.455.455 0 00-.867 0l-2.664 8.189h4.873z" fill="#FCA326"/>
  </svg>
{:else if icon === 'okta'}
  <svg class={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 0C5.389 0 0 5.389 0 12s5.389 12 12 12 12-5.389 12-12S18.611 0 12 0zm0 18c-3.314 0-6-2.686-6-6s2.686-6 6-6 6 2.686 6 6-2.686 6-6 6z" fill="#007DC1"/>
  </svg>
{:else if icon === 'auth0'}
  <svg class={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M21.98 7.448L19.62 0H4.38L2.02 7.448c-1.352 4.312.03 9.206 3.815 12.015L12 24l6.166-4.537c3.784-2.809 5.167-7.703 3.815-12.015zM12 14.474l-3.751-2.764 1.45-4.354H14.3l1.451 4.354L12 14.474z" fill="#EB5424"/>
  </svg>
{:else if icon === 'keycloak'}
  <svg class={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4.18l5.5 2.44V11c0 3.57-2.42 6.96-5.5 8.27C8.92 17.96 6.5 14.57 6.5 11V7.62L12 5.18z" fill="#4D9DE0"/>
    <path d="M10.5 9.5v5l4-2.5-4-2.5z" fill="#4D9DE0"/>
  </svg>
{:else if icon === 'authentik'}
  <svg class={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#FD4B2F" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
{:else}
  <Building2 class={className} />
{/if}
