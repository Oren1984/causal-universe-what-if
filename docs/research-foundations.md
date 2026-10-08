# Research foundations

Causal Universe is a small, practical demonstration of ideas from Judea Pearl's structural approach to causality. It implements a narrow slice of that work on a synthetic model. It does not reproduce the research, extend it, or discover anything about the real world.

## Sources

Bibliographic details were checked against the publisher or host pages on 8 October 2026.

1. **Pearl, J. (2009). *Causality: Models, Reasoning, and Inference* (2nd ed.). Cambridge University Press.**
   Book page with excerpts: <https://bayes.cs.ucla.edu/BOOK-2K/>
2. **Pearl, J. (2010). Causal Inference. *Proceedings of Workshop on Causality: Objectives and Assessment at NIPS 2008*, Proceedings of Machine Learning Research 6:39–58.**
   <https://proceedings.mlr.press/v6/pearl10a.html>
3. **Pearl, J. (2013). Structural Counterfactuals: A Brief Introduction. *Cognitive Science*, 37(6), 977–985.**
   <https://doi.org/10.1111/cogs.12065>

A note on source 2. The project brief listed this link under the title "Causal Inference in Statistics: An Overview". That title belongs to a different, longer Pearl paper (*Statistics Surveys*, vol. 3, 2009, <https://doi.org/10.1214/09-SS057>). The linked PMLR paper is titled "Causal Inference". Both cover the same framework; the citation above matches the link that was given.

Access: sources 1 and 2 are free to read at the links above. Source 3 resolves to the Wiley Online Library, where full-text access may depend on a subscription.

## The three ideas, in one paragraph each

**A structural causal model** describes a system as a set of variables, each assigned its value by a function of its direct causes and an outside disturbance. Drawing an arrow from each cause to its effect gives a directed graph.

**An intervention**, written `do(X = x)`, is not the same as *seeing* that X equals x. Seeing leaves the system alone and may tell you about X's causes too. Doing replaces the mechanism that sets X, which cuts X off from its usual causes, and then lets the consequences flow forward.

**A counterfactual** asks what would have happened to *this same unit* had something been different. In Pearl's formulation this takes three steps: infer the unit's disturbances from what was observed (abduction), modify the model (action), and recompute (prediction).

## Traceability

| Reference | Research concept | Implemented component | Demonstrated behaviour | Not implemented | Limitation |
|---|---|---|---|---|---|
| Pearl 2009, ch. 1 and 7; Pearl 2010 | Structural causal model: endogenous and exogenous variables, structural equations | `scm.py`: seven variables, six noise streams, seven equations | The world evolves from the equations; closed-form steady states are matched by tests | Learning equations or parameters from data | The model is authored, not estimated |
| Pearl 2009, ch. 1 | Causal DAG | `EDGES`, `topological_order`, `descendants`; graph view | The on-screen graph is drawn from the same edge list the engine uses; same-day acyclicity is tested | d-separation queries, graph discovery | Feedback is handled only by time-lagging; no cyclic or equilibrium models |
| Pearl 2009, ch. 3; Pearl 2010 | The do-operator as replacement of a structural equation ("graph surgery") | `Intervention` and the `assign` step in `simulate` | `do(rainfall = 0.85)` pins rainfall, leaves sunlight untouched, and changes exactly the graph descendants (Experiment B) | do-calculus rules, identification from observational data, soft or stochastic interventions | Only constant-value interventions on one variable at a time |
| Pearl 2009, ch. 3; Pearl 2010 | Observational vs. interventional distributions; confounding and the back-door path | Experiment C in `experiments.py` | Observed slope of vegetation on rainfall is negative while the interventional slope is positive; adjusting for sunlight restores the sign | A general back-door or front-door estimator; the adjustment is a single linear regression | The confounder was built in on purpose and is fully observed; real confounders are often neither |
| Pearl 2013; Pearl 2009, ch. 7 | Counterfactuals from a structural model | `paired_run`: both worlds share the full noise table | A model-based alternative outcome: the same world, same disturbances, different mechanism | **Abduction.** Disturbances are never inferred from evidence; they are known because the simulator generated them | This is a paired simulation, not individual-level counterfactual inference from observed data |
| Pearl 2010 | Direct and indirect effects | The graph view and Experiment B show that rainfall reaches creatures only through water, vegetation and food | Holding vegetation fixed blocks any effect of water on food (tested) | Numerical mediation analysis: natural direct and indirect effects are not computed | Path-specific effects are shown qualitatively only |

## What "counterfactual" means in this project

When the app shows World A beside World B, it is showing two runs of the same model with identical disturbances and one mechanism replaced. Because the simulator produced the disturbances itself, there is nothing to infer. That makes the comparison exact inside the model, and it is the "action" and "prediction" steps of Pearl's procedure. The first step, abduction from evidence, is skipped, so the project calls this a **paired comparison** or a **model-based alternative outcome** and avoids claiming counterfactual inference.

## Claims this project does not make

- It does not discover causal structure, in this world or the real one.
- It introduces no new algorithm.
- It uses no machine learning, deep learning or reinforcement learning.
- It does not reproduce or validate Pearl's research; it illustrates a few of its basic ideas.
