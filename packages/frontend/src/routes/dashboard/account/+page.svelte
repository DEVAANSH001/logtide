<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { toastStore } from '$lib/stores/toast';
  import { onboardingStore } from '$lib/stores/onboarding';
  import { UsersAPI } from '$lib/api/users';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import { Separator } from '$lib/components/ui/separator';
  import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '$lib/components/ui/alert-dialog';
  import UserCog from '@lucide/svelte/icons/user-cog';
  import Save from '@lucide/svelte/icons/save';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';

  let user = $state<any>(null);
  let token = $state<string | null>(null);
  let saving = $state(false);
  let deleting = $state(false);
  let showDeleteDialog = $state(false);

  let name = $state('');
  let email = $state('');

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');

  let deletePassword = $state('');

  const unsubAuthStore = authStore.subscribe((state) => {
    user = state.user;
    token = state.token;
    if (user) {
      name = user.name || '';
      email = user.email || '';
    }
  });

  onDestroy(() => {
    unsubAuthStore();
  });

  async function saveProfile() {
    if (!token) {
      toastStore.error('Not authenticated');
      return;
    }

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        toastStore.error('Current password is required to change password');
        return;
      }
      if (!newPassword) {
        toastStore.error('New password is required');
        return;
      }
      if (newPassword !== confirmPassword) {
        toastStore.error('Passwords do not match');
        return;
      }
      if (newPassword.length < 8) {
        toastStore.error('Password must be at least 8 characters');
        return;
      }
    }

    saving = true;
    try {
      const api = new UsersAPI(() => token);
      const response = await api.updateCurrentUser({
        name,
        email,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });

      authStore.updateUser(response.user);

      toastStore.success('Profile updated successfully');

      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to update profile';
      toastStore.error(errorMsg);
    } finally {
      saving = false;
    }
  }

  async function deleteAccount() {
    if (!token) {
      toastStore.error('Not authenticated');
      return;
    }

    if (!deletePassword) {
      toastStore.error('Password is required to delete account');
      return;
    }

    deleting = true;
    try {
      const api = new UsersAPI(() => token);
      await api.deleteCurrentUser({ password: deletePassword });

      toastStore.success('Account deleted successfully');
      authStore.clearAuth();
      goto('/login');
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to delete account';
      toastStore.error(errorMsg);
    } finally {
      deleting = false;
      showDeleteDialog = false;
      deletePassword = '';
    }
  }

  function restartTutorial() {
    onboardingStore.reset();
    toastStore.success('Tutorial restarted! Redirecting...');
    goto('/onboarding');
  }
</script>

<svelte:head>
  <title>Account settings - LogTide</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 space-y-6">
  <div class="flex items-center gap-3">
    <UserCog class="h-7 w-7 text-primary" />
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Account settings</h1>
      <p class="text-sm text-muted-foreground">Manage your profile, password and account</p>
    </div>
  </div>

  <section class="rounded-lg border bg-card p-5 sm:p-6 space-y-4">
    <div>
      <h2 class="text-lg font-semibold">Profile information</h2>
      <p class="text-sm text-muted-foreground">Name and email shown across the app</p>
    </div>
    <div class="space-y-4">
      <div class="space-y-2">
        <Label for="name">Name</Label>
        <Input
          id="name"
          type="text"
          placeholder="Your name"
          bind:value={name}
          disabled={saving}
          required
        />
      </div>
      <div class="space-y-2">
        <Label for="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="your@email.com"
          bind:value={email}
          disabled={saving}
          required
        />
      </div>
    </div>
  </section>

  <section class="rounded-lg border bg-card p-5 sm:p-6 space-y-4">
    <div>
      <h2 class="text-lg font-semibold">Change password</h2>
      <p class="text-sm text-muted-foreground">Leave blank to keep the current password</p>
    </div>
    <div class="space-y-4">
      <div class="space-y-2">
        <Label for="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          placeholder="Enter current password"
          bind:value={currentPassword}
          disabled={saving}
          autocomplete="current-password"
        />
      </div>
      <div class="space-y-2">
        <Label for="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          placeholder="Enter new password (min 8 characters)"
          bind:value={newPassword}
          disabled={saving}
          autocomplete="new-password"
        />
      </div>
      <div class="space-y-2">
        <Label for="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="Confirm new password"
          bind:value={confirmPassword}
          disabled={saving}
          autocomplete="new-password"
        />
      </div>
    </div>
  </section>

  <div class="flex justify-end">
    <Button onclick={saveProfile} disabled={saving} class="gap-2 sm:min-w-[160px]">
      <Save class="w-4 h-4" />
      {saving ? 'Saving...' : 'Save changes'}
    </Button>
  </div>

  <section class="rounded-lg border bg-card p-5 sm:p-6 space-y-4">
    <div>
      <h2 class="text-lg font-semibold">Onboarding tutorial</h2>
      <p class="text-sm text-muted-foreground">Restart the onboarding flow to revisit LogTide features</p>
    </div>
    <Button variant="outline" onclick={restartTutorial} class="gap-2">
      <RotateCcw class="w-4 h-4" />
      Restart tutorial
    </Button>
  </section>

  <section class="rounded-lg border border-destructive/40 bg-destructive/5 p-5 sm:p-6 space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-destructive">Danger zone</h2>
      <p class="text-sm text-muted-foreground">Permanently delete your account and all associated data</p>
    </div>
    <Button variant="destructive" onclick={() => (showDeleteDialog = true)} class="gap-2">
      <Trash2 class="w-4 h-4" />
      Delete account
    </Button>
  </section>
</div>

<AlertDialog bind:open={showDeleteDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Account?</AlertDialogTitle>
      <AlertDialogDescription>
        Are you sure you want to delete your account? This will permanently delete:
        <ul class="list-disc list-inside mt-2 space-y-1">
          <li>Your profile and settings</li>
          <li>All organizations you own</li>
          <li>All projects and logs in those organizations</li>
          <li>Your access to shared organizations</li>
        </ul>
        <p class="mt-4 font-semibold text-destructive">This action cannot be undone!</p>
      </AlertDialogDescription>
    </AlertDialogHeader>

    <div class="space-y-4 py-4">
      <div class="space-y-2">
        <Label for="delete-password">Confirm your password</Label>
        <Input
          id="delete-password"
          type="password"
          placeholder="Enter your password to confirm"
          bind:value={deletePassword}
          disabled={deleting}
          autocomplete="current-password"
        />
      </div>
    </div>

    <AlertDialogFooter>
      <Button
        variant="outline"
        onclick={() => {
          showDeleteDialog = false;
          deletePassword = '';
        }}
        disabled={deleting}
      >
        Cancel
      </Button>
      <Button variant="destructive" onclick={deleteAccount} disabled={deleting || !deletePassword}>
        {deleting ? 'Deleting...' : 'Delete Account'}
      </Button>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
