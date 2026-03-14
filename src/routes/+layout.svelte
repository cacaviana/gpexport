<script>
	import '../app.css';
	import { Settings, Upload, ExternalLink } from 'lucide-svelte';
	let { children } = $props();
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white border-b border-gray-200 shadow-sm">
		<div class="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
			<a href="/" class="flex items-center gap-3 no-underline">
				<div class="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center">
					<ExternalLink class="w-5 h-5 text-white" />
				</div>
				<div>
					<h1 class="text-lg font-bold text-gray-900 leading-tight">GPExport</h1>
					<p class="text-xs text-gray-500 leading-tight">08-b → ClickUp</p>
				</div>
			</a>
			<nav class="flex items-center gap-2">
				<a href="/" class="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-purple-700 hover:bg-purple-50 transition-colors flex items-center gap-2">
					<Upload class="w-4 h-4" />
					Export
				</a>
				<a href="/settings" class="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-purple-700 hover:bg-purple-50 transition-colors flex items-center gap-2">
					<Settings class="w-4 h-4" />
					Settings
				</a>
			</nav>
		</div>
	</header>

	<!-- Content -->
	<main class="max-w-5xl mx-auto px-6 py-8">
		{@render children()}
	</main>
</div>
