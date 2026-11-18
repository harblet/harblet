<script setup lang="ts">
const pillars = [
  { icon: 'i-lucide-server', title: 'Runs on your infrastructure', text: 'Your servers, your data, no vendor lock-in.' },
  { icon: 'i-lucide-rocket', title: 'Deploy from anything', text: 'A GitHub or GitLab repository, a Docker image or a Compose file, with or without a Dockerfile.' },
  { icon: 'i-lucide-users', title: 'Built for teams', text: 'Invite colleagues by email and work on the same projects.' }
]
</script>

<template>
  <div class="grid min-h-dvh bg-default lg:grid-cols-2 lg:p-3">
    <aside class="relative hidden overflow-hidden rounded-3xl bg-neutral-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div
        class="auth-grid absolute inset-0"
        aria-hidden="true"
      />
      <div
        class="auth-glow absolute inset-0"
        aria-hidden="true"
      />

      <div class="relative flex items-center gap-2.5">
        <img
          src="/logo.svg"
          alt=""
          class="size-9 rounded-lg ring-1 ring-white/10"
        >
        <span class="text-lg font-semibold tracking-tight">Harblet</span>
      </div>

      <div class="relative max-w-md">
        <h2 class="text-4xl font-semibold tracking-tight text-balance">
          The developer platform you host yourself.
        </h2>
        <p class="mt-4 text-lg text-white/60 text-pretty">
          Build and run apps, databases and Compose stacks on your own servers, with the workflow you know from managed platforms.
        </p>
      </div>

      <ul class="relative space-y-5">
        <li
          v-for="pillar in pillars"
          :key="pillar.title"
          class="flex items-start gap-4"
        >
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
            <UIcon
              :name="pillar.icon"
              class="size-4.5 text-white/80"
            />
          </span>
          <div>
            <p class="text-sm font-medium">
              {{ pillar.title }}
            </p>
            <p class="mt-0.5 text-sm text-white/55">
              {{ pillar.text }}
            </p>
          </div>
        </li>
      </ul>
    </aside>

    <main class="flex items-center justify-center px-6 py-12 sm:px-12">
      <div class="w-full max-w-sm">
        <div class="mb-10 flex items-center gap-2.5 lg:hidden">
          <img
            src="/logo.svg"
            alt=""
            class="size-9 rounded-lg"
          >
          <span class="text-lg font-semibold tracking-tight text-highlighted">Harblet</span>
        </div>

        <slot />
      </div>
    </main>
  </div>
</template>

<style>
.auth-grid {
  background-image:
    linear-gradient(to right, rgb(255 255 255 / 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgb(255 255 255 / 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at center, black 20%, transparent 75%);
}

.auth-glow {
  background:
    radial-gradient(50% 45% at 10% 0%, color-mix(in oklab, var(--ui-primary) 35%, transparent), transparent 70%),
    radial-gradient(45% 40% at 95% 100%, color-mix(in oklab, var(--ui-primary) 20%, transparent), transparent 70%);
}

/* Hide the native password reveal button in Edge; the forms have their own toggle. */
::-ms-reveal {
  display: none;
}
</style>
