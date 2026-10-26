"""Issue #5 / AUD-002: independent Difference targets, using real OCP."""
import unittest
import test_cad_runtime as fixtures
from cad_runtime import Runtime, TOLERANCES


class CadDifferenceTests(unittest.TestCase):
    setUp = fixtures.CadRuntimeTests.setUp
    run_op = fixtures.CadRuntimeTests.run_op
    ref = fixtures.CadRuntimeTests.ref
    box = fixtures.CadRuntimeTests.box

    def difference(self, targets, tools, parameters=None, expect='ok'):
        return self.run_op('solid.difference', parameters or {}, dict(
            arguments=[self.ref(s) for s in targets],
            tools=[self.ref(s) for s in tools]), expect=expect)

    def test_AUD002_multiple_targets_keep_both_remainders(self):
        a, b, c = self.box(0), self.box(20), self.box(5)
        outputs = self.difference([a, b], [c])
        self.assertEqual(len(outputs), 2)
        self.assertEqual(len({o['slotKey'] for o in outputs}), 2)
        self.assertEqual([o['kind'] for o in outputs], ['solid', 'solid'])
        self.assertAlmostEqual(outputs[0]['summary']['volumeMm3'], 500)
        self.assertAlmostEqual(outputs[1]['summary']['volumeMm3'], 1000)
        self.assertAlmostEqual(sum(o['summary']['volumeMm3'] for o in outputs), 1500)
        self.assertEqual(outputs[1]['summary']['bbox'], b['summary']['bbox'])

    def test_single_target_noncontact_empty_and_mixed_empty(self):
        a, b, c = self.box(0), self.box(20), self.box(5)
        single = self.difference([a], [c])[0]
        self.assertEqual(single['slotKey'], 'result')
        self.assertAlmostEqual(single['summary']['volumeMm3'], 500)
        chained = self.difference([single], [b])[0]
        self.assertAlmostEqual(chained['summary']['volumeMm3'], 500)
        self.assertAlmostEqual(self.difference([b], [c])[0]['summary']['volumeMm3'], 1000)
        empty = self.difference([a], [a], expect='empty')[0]
        self.assertTrue(empty['summary']['empty'])
        mixed = self.difference([a, b], [a])
        self.assertEqual(len(mixed), 2)
        self.assertTrue(mixed[0]['summary']['empty'])
        self.assertAlmostEqual(mixed[1]['summary']['volumeMm3'], 1000)
        self.difference([a, b], [a, b], expect='empty')

    def test_multiple_tools_and_disconnected_remainder_preserve_exact_inputs(self):
        a, b, c, d = self.box(0), self.box(20), self.box(5), self.box(25)
        before = self.r.handle(dict(type='export', handles=[o['handle'] for o in [a, b, c, d]]))['assets']
        for keep in [False, True]:
            outputs = self.difference([a, b], [c, d], dict(keepTools=keep))
            self.assertAlmostEqual(sum(o['summary']['volumeMm3'] for o in outputs), 1000)
        after = self.r.handle(dict(type='export', handles=[o['handle'] for o in [a, b, c, d]]))['assets']
        self.assertEqual(before, after)
        thin = self.run_op('solid.box', dict(plane=fixtures.XY, anchorMode='corner',
            anchor=[4, -1, -1], widthMm=2, depthMm=12, heightMm=12))[0]
        split_remainder = self.difference([a], [thin])[0]
        self.assertEqual(split_remainder['kind'], 'compound')
        self.assertAlmostEqual(split_remainder['summary']['volumeMm3'], 800)

    def test_every_remainder_survives_export_and_new_runtime_import(self):
        a, b, c = self.box(0), self.box(20), self.box(5)
        outputs = self.difference([a, b], [c])
        assets = self.r.handle(dict(type='export', handles=[o['handle'] for o in outputs]))['assets']
        self.assertEqual(len(outputs), 2)
        restored_runtime = Runtime()
        for output in outputs:
            restored = restored_runtime.handle(dict(type='import', hash=output['geometryHash'],
                asset=assets[output['geometryHash']]))
            self.assertEqual(restored['geometryHash'], output['geometryHash'])
            self.assertEqual(restored['summary']['bbox'], output['summary']['bbox'])
            self.assertAlmostEqual(restored['summary']['volumeMm3'], output['summary']['volumeMm3'])

    def test_unsupported_parameters_roles_and_types_fail_without_publishing(self):
        a, c = self.box(0), self.box(5)
        refs = dict(arguments=[self.ref(a)], tools=[self.ref(c)])
        cases = [
            (dict(mode='sequential'), refs, 'CAD_SCHEMA_UNSUPPORTED'),
            (dict(keepTools='true'), refs, 'CAD_INPUT_TYPE'),
            ({}, dict(arguments=[self.ref(a)], cutters=[self.ref(c)]), 'CAD_SCHEMA_UNSUPPORTED'),
            ({}, dict(arguments=[self.ref(a)], tools=[]), 'CAD_INPUT_MISSING'),
            ({}, dict(arguments=[], tools=[self.ref(c)]), 'CAD_INPUT_MISSING'),
        ]
        curve = self.run_op('curve.line', dict(start=[0, 0, 0], end=[10, 0, 0]))[0]
        cases.append(({}, dict(arguments=[self.ref(a)], tools=[self.ref(curve)]), 'CAD_INPUT_TYPE'))
        for parameters, inputs, code in cases:
            with self.subTest(parameters=parameters, inputs=inputs):
                before = set(self.r.cache)
                reply = self.r.handle(dict(type='evaluate', request=dict(protocolVersion=1,
                    operation=dict(id='solid.difference', version=1), parameters=parameters,
                    inputs=inputs, tolerances=TOLERANCES)))
                self.assertEqual(reply['status'], 'failed')
                self.assertEqual(reply['diagnostics'][0]['code'], code)
                self.assertEqual(set(self.r.cache), before)


if __name__ == '__main__':
    unittest.main()
