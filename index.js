updatedEmbed] });
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