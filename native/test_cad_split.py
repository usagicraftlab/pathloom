"""Issue #6 / AUD-003: exact split provenance, without ordinal matching."""
import unittest
from unittest.mock import patch
from cad_runtime import Runtime, TOLERANCES

XY = dict(origin=[0, 0, 0], xAxis=[1, 0, 0], yAxis=[0, 1, 0])


class SplitTests(unittest.TestCase):
    def setUp(self):
        self.runtime = Runtime()

    def evaluate(self, operation, parameters=None, inputs=None, status='ok'):
        request = dict(protocolVersion=1, operation=dict(id=operation, version=1),
                       parameters=parameters or {}, inputs=inputs or {}, tolerances=TOLERANCES)
        result = self.runtime.handle(dict(type='evaluate', request=request))
        self.assertEqual(result['status'], status, result.get('diagnostics'))
        return result

    def ref(self, output, source=None):
        ref = dict(handle=output['handle'], geometryHash=output['geometryHash'], selector=None)
        if source is not None:
            ref['sourceKey'] = source
        return ref

    def box(self):
        return self.evaluate('solid.box', dict(plane=XY, anchorMode='corner',
            anchor=[0, 0, 0], widthMm=10, depthMm=10, heightMm=10))['outputs'][0]

    def cutter(self, x=5):
        return self.evaluate('surface.corners', dict(points=[
            [x, -10, -10], [x, 20, -10], [x, 20, 20], [x, -10, 20]]))['outputs'][0]

    def split(self, targets, cutters, operation='solid.split', status='ok'):
        return self.evaluate(operation, inputs=dict(targets=targets,
            cutters=[self.ref(cutter) for cutter in cutters]), status=status)

    def test_same_split_preserves_exact_slots_after_fresh_import(self):
        box, cutter = self.box(), self.cutter()
        first = self.split([self.ref(box, 'entity-a')], [cutter])['outputs']
        self.assertEqual(len(first), 2)
        self.assertTrue(all(abs(part['summary']['volumeMm3'] - 500) < 1e-6 for part in first))
        expected = {part['slotKey'] for part in first}
        self.assertEqual(expected, {part['slotKey'] for part in
            self.split([self.ref(box, 'entity-a')], [cutter])['outputs']})
        assets = self.runtime.handle(dict(type='export', handles=[box['handle'], cutter['handle']]))['assets']
        self.runtime = Runtime()
        box, cutter = [self.runtime.handle(dict(type='import', hash=output['geometryHash'],
            asset=assets[output['geometryHash']])) for output in (box, cutter)]
        self.assertEqual(expected, {part['slotKey'] for part in
            self.split([self.ref(box, 'entity-a')], [cutter])['outputs']})

    def test_coincident_targets_and_reordered_inputs_keep_separate_sources(self):
        box, cutter = self.box(), self.cutter()
        targets = [self.ref(box, 'entity-a'), self.ref(box, 'entity-b')]
        first = self.split(targets, [cutter])['outputs']
        second = self.split(list(reversed(targets)), [cutter])['outputs']
        self.assertEqual(len(first), 4)
        self.assertEqual({o['slotKey'] for o in first}, {o['slotKey'] for o in second})
        self.assertEqual({o['sourceKey'] for o in first}, {'entity-a', 'entity-b'})
        self.assertTrue(all(o['slotKey'] == 'solid.split/' + o['sourceKey'] + '/' + o['geometryHash'] for o in first))

    def test_changed_cut_and_part_count_only_preserve_exact_assets(self):
        box, cut5, cut7 = self.box(), self.cutter(), self.cutter(7)
        first = self.split([self.ref(box, 'entity-a')], [cut5])['outputs']
        moved = self.split([self.ref(box, 'entity-a')], [cut7])['outputs']
        self.assertFalse({o['slotKey'] for o in first} & {o['slotKey'] for o in moved})
        three = self.split([self.ref(box, 'entity-a')], [cut5, cut7])['outputs']
        self.assertEqual(len(three), 3)
        self.assertAlmostEqual(sum(o['summary']['volumeMm3'] for o in three), 1000)
        common = {o['slotKey'] for o in first} & {o['slotKey'] for o in three}
        self.assertEqual(len(common), 1)

    def test_surface_split_uses_the_same_exact_source_contract(self):
        face = self.evaluate('surface.plane', dict(plane=XY, anchorMode='corner',
            anchor=[0, 0, 0], widthMm=10, heightMm=10))['outputs'][0]
        cutter = self.cutter()
        first = self.split([self.ref(face, 'face-a')], [cutter], 'surface.split')['outputs']
        second = self.split([self.ref(face, 'face-a')], [cutter], 'surface.split')['outputs']
        self.assertEqual(len(first), 2)
        self.assertEqual({o['slotKey'] for o in first}, {o['slotKey'] for o in second})
        self.assertAlmostEqual(sum(o['summary']['areaMm2'] for o in first), 100)

    def test_ambiguous_source_fails_atomically_without_leaking_handles(self):
        box, cutter = self.box(), self.cutter()
        owned = set(self.runtime.cache)
        failed = self.split([self.ref(box, 'same'), self.ref(box, 'same')], [cutter], status='failed')
        self.assertEqual(failed['outputs'], [])
        self.assertEqual(failed['diagnostics'][0]['code'], 'CAD_REFERENCE_AMBIGUOUS')
        self.assertEqual(set(self.runtime.cache), owned)

    def test_partial_publish_failure_releases_only_new_handles(self):
        box, cutter = self.box(), self.cutter()
        owned = set(self.runtime.cache)
        publish = self.runtime.publish
        count = 0
        def fail_second(*args, **kwargs):
            nonlocal count
            count += 1
            if count == 2:
                raise ValueError('fixture: second publish failed')
            return publish(*args, **kwargs)
        with patch.object(self.runtime, 'publish', side_effect=fail_second):
            self.split([self.ref(box, 'entity-a')], [cutter], status='failed')
        self.assertEqual(set(self.runtime.cache), owned)
        self.assertEqual(len(self.split([self.ref(box, 'entity-a')], [cutter])['outputs']), 2)


if __name__ == '__main__':
    unittest.main()
