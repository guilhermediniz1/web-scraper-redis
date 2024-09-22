import puppeteer from 'puppeteer';
import fs from 'fs';

const PALAVRA_CHAVE = "internet das coisas";
const LIMITE_RECURSOS = 5000;

(async () => {
    console.log(`Buscando os primeiros ${LIMITE_RECURSOS} recursos correspondentes à(s) palavra(s) chave: "${PALAVRA_CHAVE}".\nFonte: Portal de Periódico da CAPES.`);
    try {
        const URL_BASE = 'https://www-periodicos-capes-gov-br.ezl.periodicos.capes.gov.br/index.php/acervo/buscador.html';
        const FILTROS_URL = `?q=${PALAVRA_CHAVE}`;

        const navegador = await puppeteer.launch({ headless: true });
        const pagina = await navegador.newPage();
        await pagina.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
        await pagina.setViewport({ width: 1920, height: 1080 });

        console.log(URL_BASE + FILTROS_URL);
        await pagina.goto(URL_BASE + FILTROS_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

        try {
            await pagina.waitForSelector('.popup-close-button', { timeout: 5000 });
            await pagina.click('.popup-close-button');
        } catch {}

        let maisPaginas = true;

        const writeStream = fs.createWriteStream(`../dados/${PALAVRA_CHAVE}.json`, { flags: 'w', encoding: 'utf-8' });
        writeStream.write('[');
        let isFirstItem = true;
        let totalResultadosColetados = 0;

        while (maisPaginas && totalResultadosColetados < LIMITE_RECURSOS) {
            await pagina.waitForSelector('#resultados', { timeout: 30000 });

            const artigos = await pagina.$$eval('#resultados > .row', linhas => linhas.map(linha => {
                const titulo = linha.querySelector('.titulo-busca')?.innerText.trim() || 'Título não encontrado';
                const autores = linha.querySelector('.result-busca > div > .small')?.innerText.trim() || 'Autores não encontrados';
                const link = linha.querySelector('a')?.href || '';
                return { titulo, autores, link };
            }));

            const limiteConcorrencia = 30;
            for (let i = 0; i < artigos.length; i += limiteConcorrencia) {
                const loteArtigos = artigos.slice(i, i + limiteConcorrencia);

                const dadosAdicionaisLote = await Promise.all(loteArtigos.map(async artigo => {
                    if (artigo.link) {
                        const paginaArtigo = await navegador.newPage();
                        await paginaArtigo.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');
                        await paginaArtigo.goto(artigo.link, { waitUntil: 'domcontentloaded', timeout: 60000 });

                        const dadosAdicionais = await paginaArtigo.evaluate(() => {
                            const resumo = document.querySelector('#item-resumo')?.innerText.trim() || null;
                            const anoElement = document.querySelectorAll('#item-ano')[0];
                            const ano = anoElement ? (anoElement.innerText.match(/^\d+(?=;)/)?.[0]?.trim() || null) : null;
                            const topicos = document.querySelectorAll('#item-autores')[1]?.innerText.trim() || null;
                            const idioma = document.querySelector('#item-language')?.innerText.trim().replace('Linguagem: ', '') || null;
                            return { resumo, ano, topicos, idioma };
                        });

                        await paginaArtigo.close();
                        return { ...artigo, resumo: dadosAdicionais.resumo, ano: dadosAdicionais.ano, topicos: dadosAdicionais.topicos, idioma: dadosAdicionais.idioma };
                    }
                    return artigo;
                }));

                for (const item of dadosAdicionaisLote) {
                    if (!isFirstItem) {
                        writeStream.write(',\n');
                    } else {
                        isFirstItem = false;
                    }
                    writeStream.write(JSON.stringify(item, null, 2));
                }

                totalResultadosColetados += dadosAdicionaisLote.length;
                console.log(`Total de resultados coletados até agora: ${totalResultadosColetados}`);

                if (totalResultadosColetados >= LIMITE_RECURSOS) {
                    console.log(`Limite de ${LIMITE_RECURSOS} recursos atingido.`);
                    maisPaginas = false;
                    break;
                }
            }

            if (maisPaginas) {
                const botaoProxima = await pagina.$('.page-link.active + .page-item > .page-link');
                if (botaoProxima) {
                    await Promise.all([
                        botaoProxima.click(),
                        pagina.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
                    ]);
                } else {
                    maisPaginas = false;
                }
            }
        }

        writeStream.write(']');
        writeStream.end();

        console.log(`Dados salvos em ${PALAVRA_CHAVE}.json`);

        await navegador.close();
    } catch (erro) {
        console.error('Erro durante o scraping:', erro);
    }
})();
