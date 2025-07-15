const {
    Client,
    GatewayIntentBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    Events,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// --- CONFIGURAÇÃO ---
const STAFF_ROLE_ID = '1046404063673192546';
const ADMIN_ROLE_ID = '1046404063522197521';
const PANEL_CHANNEL_ID = '1385643880141029376';
const AUDIT_CHANNEL_ID = '1385646585630953623';
const FORBIDDEN_ROLE_ID = '1046404063673192546';

// --- CONFIGURAÇÃO DE HIERARQUIA ---
const ROLE_HIERARCHY = [
    { name: 'CEO', id: '1385675559325008105' },
    { name: 'CEO', id: '1046404063689977986' },
    { name: 'CM',  id: '1046404063522197521'  },
    { name: 'SEG', id: '1277638402019430501' },
    { name: 'SUP', id: '1046404063673192542' },
    { name: 'AJD', id: '1204393192284229692' }
];

const FILE_PATH = path.join(__dirname, 'avaliacoes.json');
const COOLDOWN = 6 * 60 * 60 * 1000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

const userCooldown = new Map();

// --- FUNÇÕES DE PERSISTÊNCIA DE DADOS ---
function saveVotes() { try { const data = Object.fromEntries(votes); fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2)); console.log('Avaliações salvas com sucesso!'); } catch (error) { console.error('ERRO CRÍTICO: Falha ao salvar o arquivo de avaliações.', error); } }
function loadVotes() { try { if (fs.existsSync(FILE_PATH)) { const data = fs.readFileSync(FILE_PATH, 'utf-8'); if (data.length === 0) { console.log('Arquivo de avaliações encontrado, mas está vazio.'); return new Map(); } const jsonObject = JSON.parse(data); console.log('Arquivo de avaliações carregado com sucesso.'); return new Map(Object.entries(jsonObject)); } else { console.log('Arquivo de avaliações não encontrado.'); } } catch (error) { console.error('ERRO CRÍTICO: Falha ao carregar o arquivo avaliacoes.json.', error); } return new Map(); }
const votes = loadVotes();

// --- FUNÇÃO AUXILIAR PARA CRIAR O EMBED DO PAINEL INDIVIDUAL ---
function createStaffPanelEmbed(staffMember, ratingData) {
    let average = 0;
    let count = 0;
    let starString = 'Nenhuma avaliação ainda';

    if (ratingData && ratingData.count > 0) {
        average = (ratingData.total / ratingData.count);
        count = ratingData.count;
        const fullStars = Math.floor(average);
        const halfStar = (average - fullStars) >= 0.5 ? 1 : 0;
        const emptyStars = 5 - fullStars - halfStar;
        starString = '⭐'.repeat(fullStars) + '半'.repeat(halfStar) + '☆'.repeat(emptyStars) + ` (${average.toFixed(2)})`;
    }

    return new EmbedBuilder()
        .setColor(0x3498DB)
        .setAuthor({ name: staffMember.displayName, iconURL: staffMember.user.displayAvatarURL() })
        .addFields(
            { name: 'Avaliação Média', value: starString, inline: true },
            { name: 'Total de Avaliações', value: `**${count}**`, inline: true }
        )
        .setTimestamp();
}

// --- FUNÇÃO AUXILIAR PARA OBTER O NÍVEL HIERÁRQUICO DE UM MEMBRO ---
function getMemberHierarchyLevel(member) {
    for (let i = 0; i < ROLE_HIERARCHY.length; i++) {
        if (member.roles.cache.has(ROLE_HIERARCHY[i].id)) {
            return i;
        }
    }
    return ROLE_HIERARCHY.length;
}

client.once('ready', () => { console.log(`Bot online como ${client.user.tag}`); });

// --- COMANDOS DE ADMIN ---
client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;

    if (message.content === '!setup-painel-avaliacao') {
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) return message.reply('❌ Você não tem permissão.');
        const targetChannel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
        if (!targetChannel) return message.reply('❌ Canal do painel não encontrado.');
        const panelEmbed = new EmbedBuilder().setColor(0x5865F2).setTitle('🌟 Painel de Avaliação da Equipe').setDescription('Clique no botão abaixo para avaliar um membro da nossa equipe.');
        const panelButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('start_evaluation').setLabel('Avaliar um Atendimento').setStyle(ButtonStyle.Success).setEmoji('⭐'));
        await targetChannel.send({ embeds: [panelEmbed], components: [panelButton] });
        return message.reply(`✅ Painel de avaliação principal criado em <#${PANEL_CHANNEL_ID}>.`);
    }

    if (message.content === '!gerenciar-paineis-staff') {
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) return message.reply('❌ Você não tem permissão.');
        const msg = await message.reply('🔄 Iniciando gerenciamento dos painéis...');
        const guild = message.guild;
        await guild.members.fetch();
        let staffMembers = guild.members.cache.filter(member => member.roles.cache.has(STAFF_ROLE_ID) && !member.user.bot);
        const panelChannel = await client.channels.fetch(PANEL_CHANNEL_ID).catch(() => null);
        if (!panelChannel) return msg.edit('❌ Canal do painel não encontrado.');
        const oldPanelIds = [];
        for (const [staffId, staffData] of votes.entries()) {
            if (staffData.panelMessageId) {
                oldPanelIds.push(staffData.panelMessageId);
            }
            if(votes.has(staffId)) votes.get(staffId).panelMessageId = null;
        }
        if (oldPanelIds.length > 0) {
            await msg.edit(`🔄 Deletando ${oldPanelIds.length} painéis antigos para reorganizar...`);
            await panelChannel.bulkDelete(oldPanelIds, true).catch(err => console.log("Não foi possível deletar todas as mensagens."));
        }
        await msg.edit('🔄 Ordenando a equipe por hierarquia...');
        let staffArray = Array.from(staffMembers.values());
        staffArray.sort((a, b) => getMemberHierarchyLevel(a) - getMemberHierarchyLevel(b));
        let created = 0;
        await msg.edit(`🔄 Criando ${staffArray.length} painéis na ordem correta...`);
        for (const staffMember of staffArray) {
            const staffId = staffMember.id;
            if (!votes.has(staffId)) {
                votes.set(staffId, { total: 0, count: 0, panelMessageId: null });
            }
            const ratingData = votes.get(staffId);
            const panelEmbed = createStaffPanelEmbed(staffMember, ratingData);
            try {
                const newPanel = await panelChannel.send({ embeds: [panelEmbed] });
                ratingData.panelMessageId = newPanel.id;
                created++;
            } catch (error) {
                console.error(`Falha ao criar painel para ${staffMember.displayName}:`, error);
            }
        }
        saveVotes();
        await msg.edit(`✅ **Gerenciamento concluído!**\n- ${created} painéis foram criados na ordem correta.`);
    }
});

// --- GERENCIADOR DE INTERAÇÕES (AVALIAÇÕES) ---
client.on(Events.InteractionCreate, async interaction => {
    // Lógica para o botão inicial de avaliação e para os botões de paginação
    if (interaction.isButton() && (interaction.customId === 'start_evaluation' || interaction.customId.startsWith('eval_page_'))) {
        const guild = interaction.guild;
        await guild.members.fetch();

        const staffMembers = guild.members.cache.filter(member => member.roles.cache.has(STAFF_ROLE_ID) && !member.user.bot);
        if (staffMembers.size === 0) {
            return interaction.reply({ content: 'Não encontrei nenhum membro da equipe para avaliar no momento.', flags: MessageFlags.Ephemeral });
        }

        const staffArray = Array.from(staffMembers.values()).sort((a, b) => getMemberHierarchyLevel(a) - getMemberHierarchyLevel(b));
        const itemsPerPage = 25;
        let currentPage = 0;

        // Extrai a página do customId do botão, se for um botão de paginação
        if (interaction.customId.startsWith('eval_page_')) {
            currentPage = parseInt(interaction.customId.split('_')[2], 10);
        }

        const totalPages = Math.ceil(staffArray.length / itemsPerPage);
        const startIndex = currentPage * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const staffOnPage = staffArray.slice(startIndex, endIndex);

        const options = staffOnPage.map(member => {
            const ratingData = votes.get(member.id);
            let ratingDescription = 'Sem avaliações';
            if (ratingData && ratingData.count > 0) {
                const average = (ratingData.total / ratingData.count).toFixed(2);
                const count = ratingData.count;
                const plural = count === 1 ? 'avaliação' : 'avaliações';
                ratingDescription = `⭐ ${average} (${count} ${plural})`;
            }
            return { label: member.displayName, description: ratingDescription, value: member.id };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_staff_to_rate')
            .setPlaceholder(`Selecione o staff (Página ${currentPage + 1}/${totalPages})`)
            .addOptions(options);

        const rowMenu = new ActionRowBuilder().addComponents(selectMenu);
        const components = [rowMenu];

        // Adiciona botões de navegação se houver mais de uma página
        if (totalPages > 1) {
            const rowButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`eval_page_${currentPage - 1}`)
                    .setLabel('Anterior')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage === 0),
                new ButtonBuilder()
                    .setCustomId(`eval_page_${currentPage + 1}`)
                    .setLabel('Próximo')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage >= totalPages - 1)
            );
            components.push(rowButtons);
        }

        const responsePayload = {
            content: 'Por favor, selecione abaixo o membro da equipe que você deseja avaliar:',
            components: components,
            flags: MessageFlags.Ephemeral
        };
        
        if (interaction.customId.startsWith('eval_page_')) {
             await interaction.update(responsePayload);
        } else {
             await interaction.reply(responsePayload);
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_staff_to_rate') {
        const staffId = interaction.values[0];
        const ratingData = votes.get(staffId);
        const average = ratingData && ratingData.count > 0 ? (ratingData.total / ratingData.count).toFixed(2) : 'sem avaliações';
        const count = ratingData?.count || 0;
        const row = new ActionRowBuilder();
        for (let i = 1; i <= 5; i++) { row.addComponents(new ButtonBuilder().setCustomId(`rate_${staffId}_${i}`).setLabel('⭐'.repeat(i)).setStyle(ButtonStyle.Primary)); }
        await interaction.update({ content: `Como foi seu atendimento com <@${staffId}>?\nEle(a) possui **${average}** estrelas com base em **${count}** avaliações.`, components: [row] });
    }

    if (interaction.isButton() && interaction.customId.startsWith('rate_')) {
        if (interaction.member.roles.cache.has(FORBIDDEN_ROLE_ID)) { return interaction.update({ content: '❌ Você não tem permissão para avaliar.', components: [] }); }
        const [, staffId, rateStr] = interaction.customId.split('_');
        const key = `${interaction.user.id}_${staffId}`;
        const now = Date.now();
        if (userCooldown.has(key) && (now - userCooldown.get(key) < COOLDOWN)) {
            const remainingTime = COOLDOWN - (now - userCooldown.get(key));
            const remainingHours = (remainingTime / (1000 * 60 * 60)).toFixed(1);
            return interaction.update({ content: `Você só pode avaliar este membro a cada 6 horas. Aguarde ${remainingHours} horas.`, components: [] });
        }
        const selectionRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`openmodal_ticket_${staffId}_${rateStr}`).setLabel('Atendimento via Ticket').setStyle(ButtonStyle.Secondary).setEmoji('🎫'), new ButtonBuilder().setCustomId(`openmodal_call_${staffId}_${rateStr}`).setLabel('Atendimento via Call').setStyle(ButtonStyle.Secondary).setEmoji('📞'));
        await interaction.update({ content: '**Qual foi o tipo de atendimento realizado?**', components: [selectionRow], });
    }

    if (interaction.isButton() && interaction.customId.startsWith('openmodal_')) {
        const [, type, staffId, rateStr] = interaction.customId.split('_');
        const modal = new ModalBuilder().setCustomId(`modal_${type}_${staffId}_${rateStr}`).setTitle('Justificativa da Avaliação');
        const justificativaInput = new TextInputBuilder().setCustomId('justificativaInput').setLabel("Por que você deu essa nota?").setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Ex: Atendimento rápido e resolveu meu problema com eficiência.');
        modal.addComponents(new ActionRowBuilder().addComponents(justificativaInput));
        await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_')) {
        const [, type, staffId, rateStr] = interaction.customId.split('_');
        const rate = parseInt(rateStr, 10);
        const justificativa = interaction.fields.getTextInputValue('justificativaInput');
        if (!votes.has(staffId)) { votes.set(staffId, { total: 0, count: 0, panelMessageId: null }); }
        const ratingData = votes.get(staffId);
        ratingData.total += rate;
        ratingData.count += 1;
        userCooldown.set(`${interaction.user.id}_${staffId}`, Date.now());
        saveVotes();
        try {
            const auditChannel = await client.channels.fetch(AUDIT_CHANNEL_ID);
            if (auditChannel && auditChannel.isTextBased()) {
                const serviceTypeText = type === 'ticket' ? 'Atendimento via Ticket' : 'Atendimento via Call Suporte';
                const auditEmbed = new EmbedBuilder().setColor(0x3498DB).setTitle('📝 Nova Avaliação Recebida').addFields({ name: '👤 Avaliador', value: `<@${interaction.user.id}> (ID: ${interaction.user.id})`, inline: false }, { name: '👥 Staff Avaliado', value: `<@${staffId}> (ID: ${staffId})`, inline: false }, { name: '⭐ Nota', value: '⭐'.repeat(rate) + ` (${rate} estrelas)`, inline: false }, { name: '🔧 Tipo de Atendimento', value: serviceTypeText, inline: false }, { name: '💬 Justificativa', value: `\`\`\`${justificativa}\`\`\``, inline: false }).setTimestamp().setFooter({ text: 'Sistema de Avaliação', iconURL: client.user.displayAvatarURL() });
                await auditChannel.send({ embeds: [auditEmbed] });
            }
        } catch (error) { console.error('Erro ao enviar a mensagem de auditoria:', error); }
        if (ratingData.panelMessageId) {
            try {
                const panelChannel = await client.channels.fetch(PANEL_CHANNEL_ID);
                const panelToUpdate = await panelChannel.messages.fetch(ratingData.panelMessageId);
                const staffMember = await interaction.guild.members.fetch(staffId);
                const updatedEmbed = createStaffPanelEmbed(staffMember, ratingData);
                await panelToUpdate.edit({ embeds: [updatedEmbed] });
            } catch (error) { console.error(`Falha ao atualizar painel individual para ${staffId} em tempo real:`, error); }
        }
        await interaction.reply({ content: '✅ Sua avaliação foi enviada com sucesso!', flags: [MessageFlags.Ephemeral] });
    }
});


// =======================================================
// NOVO CÓDIGO DO SERVIDOR WEB (UPTIMEROBOT)
// =======================================================
const app = express();
const port = 3000;

app.get('/', (req, res) => {
  res.send('Bot de avaliação está online! Ping recebido com sucesso.');
});

app.listen(port, () => {
  console.log(`[INFO] Servidor web de monitoramento iniciado na porta ${port}.`);
});
// =======================================================


// Esta é a última linha do arquivo
client.login(process.env.TOKEN);