import unittest
from cad_runtime import Runtime, TOLERANCES

class StepConnectionTests(unittest.TestCase):
    def test_step_export_reimports_in_fresh_runtime_with_equal_metrics(self):
        source = Runtime()
        request = dict(
            protocolVersion=1,
            operation=dict(id='solid.box', version=1),
            parameters=dict(plane=dict(origin=[0,0,0],xAxis=[1,0,0],yAxis=[0,1,0]), anchorMode='corner', anchor=[12,-4,3], widthMm=10, depthMm=20, heightMm=30),
            inputs={},
            tolerances=TOLERANCES,
        )
        made = source.handle(dict(type='evaluate', request=request))
        self.assertEqual(made['status'], 'ok')
        original = made['outputs'][0]
        exported = source.handle(dict(type='export-step', handle=original['handle']))
        self.assertEqual(exported['sourceGeometryHash'], original['geometryHash'])
        self.assertEqual(exported['units'], 'mm')
        self.assertTrue(exported['step'].lstrip().startswith('ISO-10303-21;'))

        fresh = Runtime()
        restored = fresh.handle(dict(type='import-step', step=exported['step']))
        a, b = original['summary'], restored['summary']
        self.assertEqual(b['kind'], 'solid')
        self.assertTrue(b['valid'])
        self.assertTrue(b['closure']['enclosesVolume'])
        self.assertAlmostEqual(a['volumeMm3'], b['volumeMm3'], places=6)
        self.assertAlmostEqual(a['areaMm2'], b['areaMm2'], places=6)
        for av, bv in zip(a['bbox']['min'] + a['bbox']['max'], b['bbox']['min'] + b['bbox']['max']):
            self.assertAlmostEqual(av, bv, places=6)

    def test_step_export_rejects_unknown_handle_and_invalid_text(self):
        runtime = Runtime()
        with self.assertRaisesRegex(Exception, '正本'):
            runtime.handle(dict(type='export-step', handle='missing'))
        with self.assertRaisesRegex(Exception, 'STEP文書'):
            runtime.handle(dict(type='import-step', step='not step'))

if __name__ == '__main__':
    unittest.main()
