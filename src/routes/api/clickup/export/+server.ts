import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

async function clickupFetch(path: string, method: string = 'GET', body?: any) {
	const token = env.CLICKUP_API_TOKEN;
	const res = await fetch(`${CLICKUP_BASE}${path}`, {
		method,
		headers: {
			Authorization: token!,
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`ClickUp ${method} ${path}: ${res.status} ${text}`);
	}
	return res.json();
}

const STATUS_MAP: Record<string, string> = {
	todo: 'to do',
	in_progress: 'in progress',
	done: 'complete',
	blocked: 'blocked',
	review: 'in review'
};

function buildDomainDescription(domain: any, levelNum: number, levelName: string): string {
	const lines: string[] = [];

	if (domain.domainDescription) {
		lines.push(domain.domainDescription);
		lines.push('');
	}

	lines.push(`📊 Nível: ${levelNum} — ${levelName}`);
	lines.push(`📦 Total: ${domain.devFeatures?.length || 0} dev features`);

	if (domain.dependsOn?.length > 0) {
		lines.push(`🔗 Depende de: ${domain.dependsOn.join(', ')}`);
	}

	if (domain.implementationOrder) {
		lines.push('');
		lines.push('📋 Ordem de implementação:');
		lines.push(domain.implementationOrder);
	}

	if (domain.files?.length > 0) {
		lines.push('');
		lines.push('📁 Arquivos do domínio:');
		for (const f of domain.files) {
			lines.push(`  • ${f}`);
		}
	}

	return lines.join('\n');
}

function buildTaskDescription(feature: any, domain: any, levelNum: number, levelName: string): string {
	const sections: string[] = [];

	// Main description
	if (feature.description) {
		sections.push(`📌 ${feature.description}`);
	}

	// Acceptance criteria
	if (feature.acceptance) {
		sections.push('');
		sections.push('✅ Critérios de Aceite:');
		sections.push(feature.acceptance);
	}

	// Files
	if (feature.files?.length > 0) {
		sections.push('');
		sections.push('📁 Arquivos:');
		for (const f of feature.files) {
			sections.push(`  • ${f}`);
		}
	}

	// Metadata
	sections.push('');
	sections.push('---');
	sections.push(`🏷️ Nível: ${levelNum} — ${levelName}`);
	sections.push(`📂 Domínio: ${domain.name}`);

	if (domain.dependsOn?.length > 0) {
		sections.push(`🔗 Domínio depende de: ${domain.dependsOn.join(', ')}`);
	}
	if (feature.dependsOn?.length > 0) {
		sections.push(`⛓️ Dev feature depende de: ${feature.dependsOn.join(', ')}`);
	}

	return sections.join('\n');
}

export const POST: RequestHandler = async ({ request }) => {
	const token = env.CLICKUP_API_TOKEN;
	const teamId = env.CLICKUP_TEAM_ID;
	if (!token) return json({ ok: false, error: 'No ClickUp API token' }, { status: 400 });
	if (!teamId) return json({ ok: false, error: 'No Team ID configured' }, { status: 400 });

	const { data, spaceId: existingSpaceId, spaceName: customSpaceName } = await request.json();
	if (!data?.projectName || !data?.levels) {
		return json({ ok: false, error: 'Invalid data structure' }, { status: 400 });
	}

	const log: string[] = [];
	try {
		// 1. Create or reuse Space
		let spaceId: string;
		if (existingSpaceId) {
			spaceId = existingSpaceId;
			log.push(`📌 Usando Space existente (id: ${spaceId})`);
		} else {
			const spaceName = customSpaceName || data.projectName;
			const space = await clickupFetch(`/team/${teamId}/space`, 'POST', {
				name: spaceName,
				multiple_assignees: true,
				features: {
					due_dates: { enabled: true, start_date: false, remap_due_dates: false, remap_closed_due_date: false },
					checklists: { enabled: true },
					tags: { enabled: true }
				}
			});
			spaceId = space.id;
			log.push(`✅ Space "${spaceName}" criado (id: ${spaceId})`);
		}

		// 2. Flatten: collect all domains across levels
		const allDomains: { domain: any; levelNum: number; levelName: string }[] = [];
		for (const level of data.levels) {
			for (const domain of level.domains) {
				allDomains.push({ domain, levelNum: level.level, levelName: level.name });
			}
		}

		// 3. Create tags for levels
		const levelTags: Record<number, string> = {};
		const tagColors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626'];
		for (const level of data.levels) {
			const tagName = `Nível ${level.level}`;
			try {
				await clickupFetch(`/space/${spaceId}/tag`, 'POST', {
					tag: { name: tagName, tag_bg: tagColors[level.level - 1] || '#6b7280', tag_fg: '#ffffff' }
				});
				levelTags[level.level] = tagName;
				log.push(`🏷️ Tag "${tagName}" criada`);
			} catch {
				levelTags[level.level] = tagName;
			}
		}

		// 4. For each domain: create Folder
		for (const { domain, levelNum, levelName } of allDomains) {
			const folderName = domain.name;
			const folder = await clickupFetch(`/space/${spaceId}/folder`, 'POST', {
				name: folderName
			});
			log.push(`📂 Domínio "${folderName}" criado`);

			// 5. Create List "Backlog" with domain description as content
			const featureCount = domain.devFeatures?.length || domain.totalFeatures || 0;
			const listDescription = buildDomainDescription(domain, levelNum, levelName);
			const list = await clickupFetch(`/folder/${folder.id}/list`, 'POST', {
				name: `Backlog (${featureCount} tasks)`,
				content: listDescription
			});
			log.push(`  📋 Backlog criado`);

			// 6. For each dev feature: create Task with rich description
			for (const feature of domain.devFeatures) {
				const description = buildTaskDescription(feature, domain, levelNum, levelName);

				const taskBody: any = {
					name: feature.name,
					description,
					status: STATUS_MAP[feature.statusBack] || 'to do',
					tags: [levelTags[levelNum]].filter(Boolean)
				};

				const task = await clickupFetch(`/list/${list.id}/task`, 'POST', taskBody);

				// 7. Create checklist "Camadas" with Back/Front/QA
				const checklist = await clickupFetch(`/task/${task.id}/checklist`, 'POST', {
					name: 'Camadas'
				});

				const layers = [
					{ name: 'Back', status: feature.statusBack },
					{ name: 'Front', status: feature.statusFront },
					{ name: 'QA', status: feature.statusQA }
				];
				for (const layer of layers) {
					await clickupFetch(`/checklist/${checklist.checklist.id}/checklist_item`, 'POST', {
						name: layer.name,
						resolved: layer.status === 'done'
					});
				}

				// 8. If feature has files, create a second checklist "Arquivos"
				if (feature.files?.length > 0) {
					const filesChecklist = await clickupFetch(`/task/${task.id}/checklist`, 'POST', {
						name: 'Arquivos'
					});
					for (const file of feature.files) {
						await clickupFetch(`/checklist/${filesChecklist.checklist.id}/checklist_item`, 'POST', {
							name: file,
							resolved: false
						});
					}
				}

				const statusEmoji = feature.statusBack === 'done' ? '✅' : feature.statusBack === 'blocked' ? '🔴' : '⬜';
				log.push(`    ${statusEmoji} ${feature.name}`);
			}
		}

		const totalTasks = allDomains.reduce((s, d) => s + (d.domain.devFeatures?.length || 0), 0);
		log.push('');
		log.push(`🎯 Resumo: ${allDomains.length} domínios, ${totalTasks} tasks criadas`);

		return json({ ok: true, log });
	} catch (e: any) {
		log.push(`❌ Erro: ${e.message}`);
		return json({ ok: false, error: e.message, log }, { status: 500 });
	}
};
