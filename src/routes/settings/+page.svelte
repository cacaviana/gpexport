<script lang="ts">
	import { KeyRound, Plug, CheckCircle, AlertCircle, Loader2, Bot, ChevronDown, ChevronRight } from 'lucide-svelte';

	let clickupToken = $state('');
	let anthropicKey = $state('');
	let teamId = $state('');
	let teams: { id: string; name: string }[] = $state([]);
	let testing = $state(false);
	let saving = $state(false);
	let savingPrompt = $state(false);
	let message = $state('');
	let messageType: 'success' | 'error' | '' = $state('');
	let loaded = $state(false);
	let agentPrompt = $state('');
	let showPrompt = $state(false);

	async function loadSettings() {
		const res = await fetch('/api/settings');
		const data = await res.json();
		if (data.hasClickup) clickupToken = data.clickupToken;
		if (data.hasAnthropic) anthropicKey = data.anthropicKey;
		if (data.teamId) teamId = data.teamId;
		if (data.agentPrompt) agentPrompt = data.agentPrompt;
		loaded = true;
	}

	async function testConnection() {
		testing = true;
		message = '';
		try {
			const res = await fetch('/api/clickup/test');
			const data = await res.json();
			if (data.ok) {
				teams = data.teams;
				if (teams.length === 1 && !teamId) teamId = teams[0].id;
				message = `Conectado! ${teams.length} workspace(s) encontrado(s).`;
				messageType = 'success';
			} else {
				message = data.error;
				messageType = 'error';
			}
		} catch (e: any) {
			message = e.message;
			messageType = 'error';
		}
		testing = false;
	}

	async function saveSettings() {
		saving = true;
		message = '';
		try {
			const body: any = {};
			if (clickupToken && !clickupToken.startsWith('••••')) body.clickupToken = clickupToken;
			if (anthropicKey && !anthropicKey.startsWith('••••')) body.anthropicKey = anthropicKey;
			if (teamId) body.teamId = teamId;

			const res = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			message = 'Configurações salvas! Reinicie o servidor para aplicar novas chaves.';
			messageType = 'success';
		} catch (e: any) {
			message = e.message;
			messageType = 'error';
		}
		saving = false;
	}

	async function saveAgentPrompt() {
		savingPrompt = true;
		try {
			const res = await fetch('/api/settings/prompt', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ prompt: agentPrompt })
			});
			const data = await res.json();
			message = 'Prompt do agente salvo!';
			messageType = 'success';
		} catch (e: any) {
			message = e.message;
			messageType = 'error';
		}
		savingPrompt = false;
	}

	$effect(() => { loadSettings(); });
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold text-gray-900">Configurações</h2>
		<p class="text-gray-500 mt-1">Configure as chaves de API e o prompt do agente parser.</p>
	</div>

	<!-- API Keys -->
	<div class="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
		<!-- ClickUp Token -->
		<div class="p-6">
			<div class="flex items-center gap-3 mb-4">
				<div class="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
					<Plug class="w-4 h-4 text-purple-600" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">ClickUp API Token</h3>
					<p class="text-xs text-gray-500">Settings → Apps → API Token no ClickUp</p>
				</div>
			</div>
			<input
				type="password"
				bind:value={clickupToken}
				placeholder="pk_..."
				class="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-sm transition-all"
			/>
		</div>

		<!-- Team ID -->
		<div class="p-6">
			<div class="flex items-center gap-3 mb-4">
				<div class="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
					<KeyRound class="w-4 h-4 text-purple-600" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Team / Workspace</h3>
					<p class="text-xs text-gray-500">Clique "Testar Conexão" para detectar automaticamente</p>
				</div>
			</div>
			{#if teams.length > 0}
				<select bind:value={teamId} class="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-sm">
					<option value="">Selecione...</option>
					{#each teams as team}
						<option value={team.id}>{team.name} ({team.id})</option>
					{/each}
				</select>
			{:else}
				<input
					type="text"
					bind:value={teamId}
					placeholder="Team ID (ex: 12345678)"
					class="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-sm transition-all"
				/>
			{/if}
		</div>

		<!-- Anthropic Key -->
		<div class="p-6">
			<div class="flex items-center gap-3 mb-4">
				<div class="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
					<KeyRound class="w-4 h-4 text-purple-600" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900">Anthropic API Key</h3>
					<p class="text-xs text-gray-500">Claude Opus — usado para parsear o documento 08-b</p>
				</div>
			</div>
			<input
				type="password"
				bind:value={anthropicKey}
				placeholder="sk-ant-..."
				class="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-sm transition-all"
			/>
		</div>
	</div>

	<!-- Actions -->
	<div class="flex items-center gap-3">
		<button
			onclick={testConnection}
			disabled={testing}
			class="px-5 py-2.5 rounded-lg border border-purple-300 text-purple-700 font-medium text-sm hover:bg-purple-50 transition-colors disabled:opacity-50 flex items-center gap-2"
		>
			{#if testing}
				<Loader2 class="w-4 h-4 animate-spin" />
			{:else}
				<Plug class="w-4 h-4" />
			{/if}
			Testar Conexão
		</button>
		<button
			onclick={saveSettings}
			disabled={saving}
			class="px-5 py-2.5 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
		>
			{#if saving}
				<Loader2 class="w-4 h-4 animate-spin" />
			{:else}
				<CheckCircle class="w-4 h-4" />
			{/if}
			Salvar Chaves
		</button>
	</div>

	<!-- Agent Prompt Config -->
	<div class="bg-white rounded-xl border border-gray-200 shadow-sm">
		<button
			onclick={() => showPrompt = !showPrompt}
			class="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-xl"
		>
			<div class="flex items-center gap-3">
				<div class="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
					<Bot class="w-4 h-4 text-purple-600" />
				</div>
				<div class="text-left">
					<h3 class="font-semibold text-gray-900">Prompt do Agente Parser</h3>
					<p class="text-xs text-gray-500">Instrução que o Claude Opus recebe para parsear o doc 08-b</p>
				</div>
			</div>
			{#if showPrompt}
				<ChevronDown class="w-5 h-5 text-gray-400" />
			{:else}
				<ChevronRight class="w-5 h-5 text-gray-400" />
			{/if}
		</button>

		{#if showPrompt}
			<div class="px-6 pb-6 space-y-4">
				<textarea
					bind:value={agentPrompt}
					rows="20"
					class="w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none text-xs font-mono text-gray-700 bg-gray-50 resize-y transition-all"
				></textarea>
				<button
					onclick={saveAgentPrompt}
					disabled={savingPrompt}
					class="px-5 py-2.5 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
				>
					{#if savingPrompt}
						<Loader2 class="w-4 h-4 animate-spin" />
					{:else}
						<Bot class="w-4 h-4" />
					{/if}
					Salvar Prompt
				</button>
			</div>
		{/if}
	</div>

	<!-- Message -->
	{#if message}
		<div class="flex items-start gap-3 p-4 rounded-lg {messageType === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
			{#if messageType === 'success'}
				<CheckCircle class="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
				<p class="text-sm text-green-800">{message}</p>
			{:else}
				<AlertCircle class="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
				<p class="text-sm text-red-800">{message}</p>
			{/if}
		</div>
	{/if}
</div>
