# Review rounds 2 and later

From round 2, accept review results only from a brief naming the earlier findings and the fix's diff since the last reviewed head. Block only on an earlier finding left unfixed or a regression in what the fix touches; list every other finding in the decision as a follow-up for the implementer to file. A follow-up to an unmerged PR lands in its next round or the follow-up's packet lists it. A fix-only delta that adds no behaviour needs axis A and the corrections, not axis B; any delta that adds behaviour needs both axes.
