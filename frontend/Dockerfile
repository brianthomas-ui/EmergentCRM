# Frontend dev image (CRA dev server). For production you'd `yarn build` and serve static.
FROM node:20-slim

WORKDIR /app/frontend

# Install with yarn classic (the project's declared packageManager). yarn nests the two
# conflicting ajv majors that react-scripts 5 needs (ajv6 for fork-ts-checker, ajv8 for
# terser/schema-utils) correctly, which npm's flat hoisting does not. Install yarn via npm
# rather than corepack to avoid the pinned-hash integrity fetch.
RUN npm install -g yarn@1.22.22 --force

COPY frontend/package.json /app/frontend/package.json
RUN yarn install --network-timeout 600000

COPY frontend /app/frontend

EXPOSE 3000
# CRA needs this to bind in a container; disable the auto-open browser.
ENV HOST=0.0.0.0 BROWSER=none
CMD ["yarn", "start"]
