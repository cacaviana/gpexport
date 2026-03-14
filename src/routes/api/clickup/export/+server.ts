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

export const POST: RequestHandler = async ({ request }) => {
	const token = env.CLICKUP_API_TOKEN;
	const teamId = env.CLICKUP_TEAM_ID;
	if (!token) return json({ ok: false, error: 'No ClickUp API token' }, { status: 400 });
	if (!teamId) return json({ ok: false, error: 'No Team ID configured' }, { status: 400 });

	const { data } = await request.json();
	if (!data?.projectName || !data?.levels) {
		return json({ ok: false, error: 'Invalid data structure' }, { status: 400 });
	}

	const log: string[] = [];
	try {
		// 1. Create Space (= Project)
		const space = await clickupFetch(`/team/${teamId}/space`, 'POST', {
			name: data.projectName,
			multiple_assignees: true,
			features: {
				due_dates: { enabled: true, start_date: false, remap_due_dates: false, remap_closed_due_date: false },
				checklists: { enabled: true },
				tags: { enabled: true }
			}
		});
		log.push(`✅ Space "${data.projectName}" criado (id: ${space.id})`);

		// 2. Flatten: collect all domains across levels (domain-oriented, not level-oriented)
		// Each domain becomes a Folder (dossier). Level becomes a tag on the task.
		const allDomains: { domain: any; levelNum: number; levelName: string }[] = [];
		for (const level of data.levels) {
			for (const domain of level.domains) {
				allDomains.push({ domain, levelNum: level.level, levelName: level.name });
			}
		}

		// 3. Create tags for levels on the space
		const levelTags: Record<number, string> = {};
		const tagColors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626'];
		for (const level of data.levels) {
			const tagName = `Nível ${level.level}`;
			try {
				await clickupFetch(`/space/${space.id}/tag`, 'POST', {
					tag: { name: tagName, tag_bg: tagColors[level.level - 1] || '#6b7280', tag_fg: '#ffffff' }
				});
				levelTags[level.level] = tagName;
				log.push(`🏷️ Tag "${tagName}" criada`);
			} catch {
				levelTags[level.level] = tagName;
			}
		}

		// 4. For each domain: create Folder (= dossier)
		for (const { domain, levelNum, levelName } of allDomains) {
			const folderName = domain.name;
			const folder = await clickupFetch(`/space/${space.id}/folder`, 'POST', {
				name: folderName
			});
			log.push(`📂 Domínio "${folderName}" criado`);

			// 5. Create a single List "Backlog" inside the Folder
			const featureCount = domain.devFeatures?.length || domain.totalFeatures || 0;
			const list = await clickupFetch(`/folder/${folder.id}/list`, 'POST', {
				name: `Backlog (${featureCount} tasks)`
			});
			log.push(`  📋 List "Backlog" criado`);

			// 6. For each dev feature: create Task
			for (const feature of domain.devFeatures) {
				// Build description with metadata
				let description = feature.description || '';
				const meta: string[] = [];
				meta.push(`Nível: ${levelNum} — ${levelName}`);
				if (domain.dependsOn && domain.dependsOn.length > 0) {
					meta.push(`Domínio depende de: ${domain.dependsOn.join(', ')}`);
				}
				if (feature.dependsOn && feature.dependsOn.length > 0) {
					meta.push(`Dev feature depende de: ${feature.dependsOn.join(', ')}`);
				}
				if (meta.length > 0) {
					description += '\n\n---\n' + meta.join('\n');
				}

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
