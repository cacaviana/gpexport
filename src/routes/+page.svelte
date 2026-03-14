<script lang="ts">
	import { Upload, ChevronRight, ChevronDown, FolderOpen, List, CheckSquare, Send, Loader2, FileText, Trash2, Code, Eye, Plus, FolderSync } from 'lucide-svelte';

	let markdown = $state('');
	let parsing = $state(false);
	let exporting = $state(false);
	let parsed: any = $state(null);
	let error = $state('');
	let exportLog: string[] = $state([]);
	let expandedLevels: Record<number, boolean> = $state({});
	let expandedDomains: Record<string, boolean> = $state({});
	let showJson = $state(false);

	// Space selection
	let spaceMode: 'new' | 'existing' = $state('new');
	let customSpaceName = $state('');
	let existingSpaceId = $state('');
	let spaces: { id: string; name: string }[] = $state([]);
	let loadingSpaces = $state(false);

	async function loadSpaces() {
		loadingSpaces = true;
		try {
			const res = await fetch('/api/clickup/spaces');
			const data = await res.json();
			if (data.ok) spaces = data.spaces;
		} catch {}
		loadingSpaces = false;
	}

	let totalTasks = $derived(
		parsed?.levels?.reduce((sum: number, l: any) =>
			sum + l.domains.reduce((s: number, d: any) => s + d.devFeatures.length, 0), 0
		) ?? 0
	);

	let totalDomains = $derived(
		parsed?.levels?.reduce((sum: number, l: any) => sum + l.domains.length, 0) ?? 0
	);

	async function parseDoc() {
		if (!markdown.trim()) return;
		parsing = true;
		error = '';
		parsed = null;
		exportLog = [];
		try {
			const res = await fetch('/api/parse', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ markdown })
			});
			const data = await res.json();
			if (data.ok) {
				parsed = data.data;
				// Auto-expand all levels
				for (const l of parsed.levels) expandedLevels[l.level] = true;
			} else {
				error = data.error;
			}
		} catch (e: any) {
			error = e.message;
		}
		parsing = false;
	}

	async function exportToClickUp() {
		if (!parsed) return;
		exporting = true;
		exportLog = ['Iniciando exportação para ClickUp...'];
		error = '';
		try {
			const res = await fetch('/api/clickup/export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
				data: parsed,
				spaceId: spaceMode === 'existing' ? existingSpaceId : undefined,
				spaceName: spaceMode === 'new' && customSpaceName ? customSpaceName : undefined
			})
			});
			const data = await res.json();
			if (data.ok) {
				exportLog = data.log;
				exportLog.push('', '🎉 Exportação concluída com sucesso!');
			} else {
				exportLog = data.log || [];
				exportLog.push(`❌ ${data.error}`);
				error = data.error;
			}
		} catch (e: any) {
			error = e.message;
			exportLog.push(`❌ ${e.message}`);
		}
		exporting = false;
	}

	function statusIcon(status: string) {
		switch (status) {
			case 'done': return '✅';
			case 'in_progress': return '🔨';
			case 'blocked': return '🔴';
			case 'review': return '⏳';
			default: return '⬜';
		}
	}

	function toggleLevel(level: number) {
		expandedLevels[level] = !expandedLevels[level];
	}

	function toggleDomain(key: string) {
		expandedDomains[key] = !expandedDomains[key];
	}

	function clear() {
		markdown = '';
		parsed = null;
		error = '';
		exportLog = [];
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const file = e.dataTransfer?.files[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = () => { markdown = reader.result as string; };
			reader.readAsText(file);
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h2 class="text-2xl font-bold text-gray-900">Exportar para ClickUp</h2>
		<p class="text-gray-500 mt-1">Cole o documento do Agente 08-b e exporte direto para o ClickUp da GP.</p>
	</div>

	<!-- Upload Area -->
	{#if !parsed}
		<div
			class="relative"
			ondrop={handleDrop}
			ondragover={(e) => e.preventDefault()}
		>
			<textarea
				bind:value={markdown}
				placeholder="Cole aqui o Markdown do Agente 08-b...&#10;&#10;Ou arraste um arquivo .md para cá"
				rows="14"
				class="w-full px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none text-sm font-mono text-gray-700 bg-white resize-y transition-all placeholder:text-gray-400"
			></textarea>
			{#if !markdown}
				<div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-30">
					<Upload class="w-12 h-12 text-gray-400 mb-2" />
					<p class="text-gray-500 text-sm font-medium">Arraste o arquivo .md aqui</p>
				</div>
			{/if}
		</div>

		<div class="flex gap-3">
			<button
				onclick={parseDoc}
				disabled={!markdown.trim() || parsing}
				class="px-6 py-2.5 rounded-lg bg-purple-600 text-white font-medium text-sm hover:bg-purple-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
			>
				{#if parsing}
					<Loader2 class="w-4 h-4 animate-spin" />
					Parseando com Claude Opus...
				{:else}
					<FileText class="w-4 h-4" />
					Parsear Documento
				{/if}
			</button>
		</div>
	{/if}

	<!-- Error -->
	{#if error && !exportLog.length}
		<div class="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
			{error}
		</div>
	{/if}

	<!-- Preview -->
	{#if parsed}
		<div class="bg-white rounded-xl border border-gray-200 shadow-sm">
			<!-- Header -->
			<div class="p-5 border-b border-gray-100">
				<div class="flex items-center justify-between mb-4">
					<div>
						<h3 class="font-bold text-gray-900 text-lg">{parsed.projectName}</h3>
						<p class="text-sm text-gray-500 mt-0.5">{totalDomains} domínios, {totalTasks} tasks</p>
					</div>
					<button
						onclick={clear}
						class="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
					>
						<Trash2 class="w-4 h-4" />
						Limpar
					</button>
				</div>

				<!-- Space Selection -->
				<div class="bg-gray-50 rounded-lg p-4 space-y-3">
					<p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Destino no ClickUp</p>
					<div class="flex gap-2">
						<button
							onclick={() => spaceMode = 'new'}
							class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors {spaceMode === 'new' ? 'bg-purple-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'} flex items-center gap-1.5"
						>
							<Plus class="w-3 h-3" />
							Novo Space
						</button>
						<button
							onclick={() => { spaceMode = 'existing'; if (spaces.length === 0) loadSpaces(); }}
							class="px-3 py-1.5 rounded-md text-xs font-medium transition-colors {spaceMode === 'existing' ? 'bg-purple-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'} flex items-center gap-1.5"
						>
							<FolderSync class="w-3 h-3" />
							Space Existente
						</button>
					</div>

					{#if spaceMode === 'new'}
						<input
							type="text"
							bind:value={customSpaceName}
							placeholder={parsed.projectName}
							class="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none"
						/>
						<p class="text-xs text-gray-400">Deixe vazio para usar "{parsed.projectName}"</p>
					{:else}
						{#if loadingSpaces}
							<div class="flex items-center gap-2 text-sm text-gray-500">
								<Loader2 class="w-4 h-4 animate-spin" /> Carregando spaces...
							</div>
						{:else}
							<select bind:value={existingSpaceId} class="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-200 outline-none">
								<option value="">Selecione um Space...</option>
								{#each spaces as space}
									<option value={space.id}>{space.name}</option>
								{/each}
							</select>
							<p class="text-xs text-gray-400">Os domínios serão adicionados como Folders dentro deste Space</p>
						{/if}
					{/if}
				</div>

				<!-- Export Button -->
				<div class="mt-4">
					<button
						onclick={exportToClickUp}
						disabled={exporting || (spaceMode === 'existing' && !existingSpaceId)}
						class="px-5 py-2.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
					>
						{#if exporting}
							<Loader2 class="w-4 h-4 animate-spin" />
							Exportando...
						{:else}
							<Send class="w-4 h-4" />
							{spaceMode === 'new' ? 'Criar Space e Exportar' : 'Adicionar ao Space'}
						{/if}
					</button>
				</div>
			</div>

			<!-- Tree -->
			<div class="p-5 space-y-1">
				{#each parsed.levels as level}
					<div>
						<!-- Level (Folder) -->
						<button
							onclick={() => toggleLevel(level.level)}
							class="w-full flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-purple-50 transition-colors text-left"
						>
							{#if expandedLevels[level.level]}
								<ChevronDown class="w-4 h-4 text-purple-500" />
							{:else}
								<ChevronRight class="w-4 h-4 text-gray-400" />
							{/if}
							<FolderOpen class="w-4 h-4 text-purple-500" />
							<span class="font-semibold text-sm text-gray-800">{level.name}</span>
							<span class="text-xs text-gray-400 ml-auto">{level.domains.length} domínios</span>
						</button>

						{#if expandedLevels[level.level]}
							<div class="ml-6 space-y-0.5">
								{#each level.domains as domain, di}
									{@const domainKey = `${level.level}-${di}`}
									<div>
										<!-- Domain (List) -->
										<button
											onclick={() => toggleDomain(domainKey)}
											class="w-full flex items-center gap-2 py-1.5 px-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
										>
											{#if expandedDomains[domainKey]}
												<ChevronDown class="w-3.5 h-3.5 text-gray-400" />
											{:else}
												<ChevronRight class="w-3.5 h-3.5 text-gray-400" />
											{/if}
											<List class="w-3.5 h-3.5 text-purple-400" />
											<span class="font-medium text-sm text-gray-700">{domain.name}</span>
											<span class="text-xs text-gray-400">({domain.devFeatures.length})</span>
										</button>

										{#if expandedDomains[domainKey]}
											<div class="ml-8 space-y-0.5">
												{#each domain.devFeatures as feature}
													<div class="flex items-center gap-2 py-1 px-3 rounded text-sm">
														<span class="text-xs">{statusIcon(feature.statusBack)}</span>
														<CheckSquare class="w-3 h-3 text-gray-300" />
														<span class="text-gray-600">{feature.name}</span>
														{#if feature.description}
															<span class="text-xs text-gray-400 truncate ml-auto max-w-xs">{feature.description}</span>
														{/if}
													</div>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Output Parse (JSON) -->
	{#if parsed}
		<div class="bg-white rounded-xl border border-gray-200 shadow-sm">
			<button
				onclick={() => showJson = !showJson}
				class="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-xl"
			>
				<div class="flex items-center gap-2">
					<Code class="w-4 h-4 text-purple-500" />
					<span class="font-semibold text-sm text-gray-800">Output do Agente (JSON parseado)</span>
				</div>
				<div class="flex items-center gap-2 text-xs text-gray-400">
					{#if showJson}
						<Eye class="w-3.5 h-3.5" /> Esconder
					{:else}
						<Code class="w-3.5 h-3.5" /> Mostrar
					{/if}
				</div>
			</button>
			{#if showJson}
				<div class="px-5 pb-5">
					<pre class="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-x-auto max-h-96 overflow-y-auto">{JSON.stringify(parsed, null, 2)}</pre>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Export Log -->
	{#if exportLog.length > 0}
		<div class="bg-gray-900 rounded-xl p-5 shadow-sm">
			<h4 class="text-sm font-semibold text-gray-400 mb-3">Log de Exportação</h4>
			<div class="space-y-0.5 max-h-80 overflow-y-auto font-mono text-xs">
				{#each exportLog as line}
					<p class="text-gray-300 {line.startsWith('❌') ? 'text-red-400' : ''} {line.startsWith('🎉') ? 'text-green-400 font-bold' : ''}">{line}</p>
				{/each}
				{#if exporting}
					<p class="text-purple-400 animate-pulse">Processando...</p>
				{/if}
			</div>
		</div>
	{/if}
</div>
