type GwapTreeEnhancer = (root: ParentNode) => void;

type GwapTreeEnhancerSubscription = {
  enhance: GwapTreeEnhancer;
};

const subscriptions = new Set<GwapTreeEnhancerSubscription>();
let observer: MutationObserver | null = null;

function enhanceAddedTrees(mutations: MutationRecord[]) {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      subscriptions.forEach(({ enhance }) => enhance(node));
    }
  }
}

function startObserver() {
  if (observer || typeof document === "undefined" || !document.body) return;

  observer = new MutationObserver(enhanceAddedTrees);
  observer.observe(document.body, { childList: true, subtree: true });
}

export function subscribeGwapTreeEnhancer(enhance: GwapTreeEnhancer) {
  if (typeof document === "undefined" || !document.body) return () => {};

  const subscription = { enhance };
  subscriptions.add(subscription);
  startObserver();
  enhance(document.body);

  return () => {
    subscriptions.delete(subscription);
    if (subscriptions.size > 0) return;

    observer?.disconnect();
    observer = null;
  };
}
