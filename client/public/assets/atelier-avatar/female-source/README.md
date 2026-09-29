# Base feminina — Atelier Avatar

Criada com a ferramenta integrada de geração de imagens, usando a base existente como referência de estilo. Arte original: `base-four-directions.png`.

## Prompt utilizado

Create a production game sprite reference atlas of a feminine adult base character for this EXACT existing chibi pixel-art dress-up game. Reference image is the existing masculine base, style and proportions reference. Match its pixel clusters, warm peach skin palette, dark brown outline, huge round head, small body, same head-to-body ratio and neutral slightly outward arms. Feminine face with subtly different jaw and eyes, gentle eyelashes, no makeup required. Bald head so modular hair fits. Modest opaque charcoal sports bra and shorts, no nudity. Full body bare feet. Four evenly spaced full body orthographic views in ONE HORIZONTAL ROW in equal-sized cells: front, back, left profile facing left, right profile facing right. Same scale, same head-top and feet baseline in all four cells. Transparent background real alpha, no shadows on ground, no text, no grid or labels, no accessories, no hair, no shoes. Art must look like the same game's character, not realistic, not vector, not a new illustration style. Keep the large skull silhouette and limb lengths as close to the supplied base as possible, since existing clothes and hair will be layered on top. Symmetric standing pose, arms slightly open as reference. Crisp pixel-art edges.

## Integração

`tools/bake-female-avatar.cjs` alinha rosto, pescoço e torso novos à grade existente. Mantém os membros animados e os pontos de encaixe existentes para compatibilidade com mangas, calçados e assentos. Gera seis tons em `sheets/{direction}/skin/skin_female_01.png` até `skin_female_06.png`, com miniaturas em `items/{direction}/skin/` e registros nos dois manifests.

A escolha da base é representada pelo identificador de pele; os avatares antigos continuam usando `skin_01` a `skin_06`. Isso mantém o formato de salvamento e a sincronização já existentes. Roupas, cabelos e acessórios permanecem compartilhados.

Para executar as ferramentas fora desta máquina, defina `CANVAS_MODULE` com o módulo `@napi-rs/canvas` instalado. Validação: `node tools/test-avatar-bases.cjs`. Inspeção visual: `node tools/check-female-avatar.cjs`.
