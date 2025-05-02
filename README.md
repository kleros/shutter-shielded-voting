# Shutter Shielded Voting

This project demonstrates a proof-of-concept for a shielded voting system using the Shutter Network.

## Setup

```bash
yarn install
yarn compile
```

## Execution

### Shell 1: local node

```bash
yarn local-node
```

### Shell 2: voting

```bash
yarn deploy
yarn auto-vote
```

### Running again
The contract supports only a single voting session so it must be redeployed. Simply stop the local node and re-run the above steps.


